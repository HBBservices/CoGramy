const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let currentDisplayValue = ''; // Przechowuje bieżącą wartość wyświetlacza

// Zmienne do obsługi liczenia w górę na serwerze
let countUpIntervalId = null; // ID interwału liczącego w górę
const MAX_COUNT_SECONDS = 60; // Czas do osiągnięcia (od 0 do 60)
let currentCountUpValue = 0; // Aktualna wartość liczenia w górę, widoczna dla klientów

// TAJNY KOD - ZMIEŃ NA SILNIEJSZY W PRODUKCJI!
const ADMIN_SECRET_CODE = 'Hbb'; // <--- ZMIEŃ TO NA SILNIEJSZE HASŁO!

// Funkcja do rozsyłania aktualnej wartości wyświetlacza do wszystkich klientów
function broadcastDisplayUpdate() {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'displayUpdate', value: currentDisplayValue }));
        }
    });
}

// Funkcja do rozsyłania aktualnej wartości liczenia w górę do wszystkich klientów
function broadcastCountUpUpdate() {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'countUpUpdate', value: currentCountUpValue }));
        }
    });
}

// Funkcja do rozpoczęcia/zresetowania licznika w górę
function startServerCountUp() {
    if (countUpIntervalId) {
        clearInterval(countUpIntervalId); // Zatrzymaj poprzedni interwał, jeśli istnieje
    }
    currentCountUpValue = 0; // Zresetuj licznik do 0
    broadcastCountUpUpdate(); // Wyślij aktualizację (0) natychmiast

    countUpIntervalId = setInterval(() => {
        if (currentCountUpValue < MAX_COUNT_SECONDS) {
            currentCountUpValue++;
            broadcastCountUpUpdate();
        } else {
            clearInterval(countUpIntervalId); // Zatrzymaj licznik po osiągnięciu MAX_COUNT_SECONDS
            countUpIntervalId = null; // Zresetuj ID interwału
            currentCountUpValue = 0; // Opcjonalnie: zresetuj wartość po zakończeniu
            broadcastCountUpUpdate(); // Wyślij ostatnią aktualizację (0 lub 60)
        }
    }, 1000); // Co sekundę
}

// Serwuj pliki statyczne z katalogu 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Obsługa plików statycznych z bieżącego katalogu
app.use(express.static(__dirname));

wss.on('connection', ws => {
    console.log('Nowy klient WebSocket podłączony');

    // Wyślij bieżący stan wyświetlacza nowemu klientowi
    ws.send(JSON.stringify({ type: 'displayUpdate', value: currentDisplayValue }));
    // Wyślij bieżący stan licznika nowemu klientowi
    ws.send(JSON.stringify({ type: 'countUpUpdate', value: currentCountUpValue }));

    ws.on('message', message => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
        } catch (e) {
            console.error('Błąd parsowania wiadomości JSON:', e, 'Wiadomość:', message);
            return;
        }

        let shouldStartNewCountUp = false; // Flaga do określenia, czy licznik ma się zrestartować

        if (parsedMessage.type === 'auth') {
            if (parsedMessage.code === ADMIN_SECRET_CODE) {
                ws.send(JSON.stringify({ type: 'authResponse', success: true }));
                ws.isAuthenticated = true; // Oznacz klienta jako autoryzowanego
                console.log('Klient autoryzowany jako admin.');
            } else {
                ws.send(JSON.stringify({ type: 'authResponse', success: false }));
                console.log('Nieudana próba autoryzacji.');
            }
        } else if (ws.isAuthenticated) {
            if (parsedMessage.type === 'input') {
                const value = parsedMessage.value;
                
                // PRIORYTET: Sprawdź specjalne ciągi " Instr." i " Wokal"
                if (value === ' Instr.' || value === ' Wokal') {
                    currentDisplayValue += value; // Dodaj cały ciąg
                    shouldStartNewCountUp = true;
                } else if (value.length === 1 && /[0-9]/.test(value)) {
                    // Jeśli to pojedyncza cyfra, dodaj ją
                    currentDisplayValue += value;
                    shouldStartNewCountUp = true;
                } else if (value.length > 1) {
                    // Jeśli to dłuższy tekst (np. z listy), zastąp nim wyświetlacz
                    currentDisplayValue = value;
                    shouldStartNewCountUp = true;
                } else {
                    // Jeśli wartość input nie pasuje do żadnego znanego wzorca
                    console.warn('Nieznana lub nieprawidłowa wartość input od autoryzowanego klienta:', value);
                    // Nie zmieniaj currentDisplayValue i nie uruchamiaj timera dla nieznanych inputów
                }
            } else if (parsedMessage.type === 'reset') {
                currentDisplayValue = ''; // Wyczyść wyświetlacz
                shouldStartNewCountUp = true; // Reset także inicjuje licznik
                ws.send(JSON.stringify({ type: 'resetConfirmed' })); // Potwierdź reset do klienta
            } else if (parsedMessage.type === 'updateDisplay') {
                // To jest używane, gdy admin klika na element listy
                currentDisplayValue = parsedMessage.value;
                shouldStartNewCountUp = true; // Zmiana wyświetlacza z listy także inicjuje licznik
            } else if (parsedMessage.type === 'backspace') {
                // Obsługa backspace: usuwamy ostatni znak
                currentDisplayValue = currentDisplayValue.slice(0, -1);
                shouldStartNewCountUp = false; // Backspace nie uruchamia timera od nowa
            }
            else {
                // Ta sekcja powinna być wykonywana tylko dla naprawdę nieznanych typów wiadomości
                console.warn('Nieznany typ wiadomości od autoryzowanego klienta:', parsedMessage);
            }

            // Rozpocznij nowe liczenie w górę TYLKO jeśli była zmiana wartości wyświetlacza, która powinna to zainicjować
            if (shouldStartNewCountUp) {
                startServerCountUp();
            }

            // Zawsze rozgłoś nowy stan wyświetlacza do wszystkich podłączonych klientów
            broadcastDisplayUpdate();
        } else {
            console.log('Nieautoryzowany klient próbował wprowadzić dane.');
            ws.send(JSON.stringify({ type: 'message', text: 'Brak uprawnień do wprowadzania znaków.' }));
        }
    });

    ws.on('close', () => {
        console.log('Klient WebSocket rozłączony');
    });

    ws.on('error', error => {
        console.error('Błąd WebSocket dla klienta:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serwer nasłuchuje na porcie ${PORT}`);
    // Opcjonalnie: rozpocznij licznik przy starcie serwera
    // startServerCountUp();
});
