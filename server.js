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

// Funkcja rozpoczynająca/resetująca liczenie w górę na serwerze
function startServerCountUp() {
    // 1. Wyczyść poprzedni interwał liczenia (jeśli istnieje), aby rozpocząć od nowa
    if (countUpIntervalId) {
        clearInterval(countUpIntervalId);
    }

    currentCountUpValue = 0; // Ustaw startową wartość na 0
    broadcastCountUpUpdate(); // Wyślij od razu aktualną wartość (0) do wszystkich

    // Rozpocznij nowy interwał do liczenia w górę i rozsyłania co sekundę
    countUpIntervalId = setInterval(() => {
        currentCountUpValue++; // Zwiększaj licznik
        broadcastCountUpUpdate(); // Rozsyłaj aktualną wartość do wszystkich

        if (currentCountUpValue >= MAX_COUNT_SECONDS) {
            clearInterval(countUpIntervalId); // Zatrzymaj interwał, gdy osiągnie 60
            countUpIntervalId = null; // Ustaw ID na null, żeby oznaczyć, że nie ma aktywnego timera
            performDisplayReset(); // Wykonaj reset displaya i timera (co ukryje timer)
        }
    }, 1000); // Co sekundę
}

// Funkcja wykonująca reset wyświetlacza i timera
function performDisplayReset() {
    currentDisplayValue = ''; // Zresetuj wartość wyświetlacza
    broadcastDisplayUpdate(); // Poinformuj wszystkich o resecie wyświetlacza

    // Upewnij się, że timer jest wyłączony i ma wartość 0
    if (countUpIntervalId) {
        clearInterval(countUpIntervalId);
        countUpIntervalId = null;
    }
    currentCountUpValue = 0; // Ustaw na 0
    broadcastCountUpUpdate(); // Wyczyść timer u wszystkich (wysłanie 0 spowoduje ukrycie go na frontendzie)
}


// Serwuj pliki statyczne z katalogu głównego
app.use(express.static(path.join(__dirname, '')));

// Obsługa pliku index.html dla ścieżki głównej
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

wss.on('connection', ws => {
    console.log('Nowe połączenie WebSocket');
    ws.isAdmin = false; // Domyślnie nowe połączenie nie jest adminem

    // Wyślij aktualny stan wyświetlacza i timera do nowo połączonego klienta
    ws.send(JSON.stringify({ type: 'displayUpdate', value: currentDisplayValue }));
    ws.send(JSON.stringify({ type: 'countUpUpdate', value: currentCountUpValue }));


    ws.on('message', message => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message.toString());
        } catch (e) {
            console.error('Błąd parsowania JSON:', e);
            return; // Ignoruj niepoprawne wiadomości JSON
        }

        console.log('Otrzymano wiadomość:', parsedMessage);

        // Logika autoryzacji
        if (parsedMessage.type === 'auth' && parsedMessage.code === ADMIN_SECRET_CODE) {
            ws.isAdmin = true;
            ws.send(JSON.stringify({ type: 'authResponse', success: true }));
            console.log('Klient autoryzowany jako admin.');
        } else if (parsedMessage.type === 'auth' && parsedMessage.code !== ADMIN_SECRET_CODE) {
            ws.send(JSON.stringify({ type: 'authResponse', success: false }));
            console.log('Nieprawidłowy kod admina.');
        }
        // Logika dla admina (zmiana wyświetlacza i reset)
        else if (ws.isAdmin) {
            let shouldStartNewCountUp = false; // Flaga, czy powinniśmy rozpocząć nowe liczenie w górę

            if (parsedMessage.type === 'updateDisplay' && typeof parsedMessage.value === 'string') {
                currentDisplayValue = parsedMessage.value; // Ustaw całą wartość displaya
                shouldStartNewCountUp = true; // Zmiana wyświetlacza -> start licznika
            } else if (parsedMessage.type === 'reset') {
                performDisplayReset(); // Natychmiastowy reset wyświetlacza i timera
                // Po resecie ręcznym, wyślij potwierdzenie do klienta (opcjonalnie, ale dobra praktyka)
                ws.send(JSON.stringify({ type: 'resetConfirmed' }));
                shouldStartNewCountUp = false; // Po manualnym resecie nie rozpoczynamy liczenia, tylko czekamy na kolejny input
            }
            // ZMODYFIKOWANY WARUNEK: Akceptuje cyfry, oraz słowa ' Instrumental' i ' Wokal' ze spacją
            else if (parsedMessage.type === 'input' && typeof parsedMessage.value === 'string') {
                // Sprawdź, czy wartość jest cyfrą lub jednym ze specjalnych słów ze spacją
                if (/[0-9]/.test(parsedMessage.value) || parsedMessage.value === ' Instrumental' || parsedMessage.value === ' Wokal') {
                    currentDisplayValue += parsedMessage.value; // Dodaj otrzymany znak/słowo
                    shouldStartNewCountUp = true; // Wpisanie znaku/słowa -> start licznika
                } else {
                    // Jeśli wartość nie pasuje do żadnego z oczekiwanych formatów, nie rób nic i zaloguj
                    console.warn('Nieznana lub nieprawidłowa wartość input od autoryzowanego klienta:', parsedMessage.value);
                }
            } else if (parsedMessage.type === 'backspace') {
                // Obsługa backspace: usuwamy ostatni znak
                currentDisplayValue = currentDisplayValue.slice(0, -1);
                shouldStartNewCountUp = false; // Backspace nie uruchamia timera od nowa
            }
            else {
                // Ta sekcja powinna być wykonywana tylko dla naprawdę nieznanych typów wiadomości
                console.warn('Nieznany typ wiadomości lub nieprawidłowa wartość od autoryzowanego klienta:', parsedMessage);
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
    // Zaktualizowany URL dla nowego Web Service na Renderze "CoGramy"
    console.log(`Aplikacja powinna być dostępna pod adresem: https://cogramy.onrender.com/`);
});
