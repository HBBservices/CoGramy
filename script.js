const display = document.getElementById('display');
const adminPanel = document.getElementById('admin-panel');
const secretCodeInput = document.getElementById('secret-code-input');
const keypadButtons = document.getElementById('keypad-buttons');
const adminMessage = document.getElementById('admin-message');
const messageSection = document.getElementById('message-section');

const fileInput = document.getElementById('file-input');
const fileContentSection = document.getElementById('file-content-section');
const listButtonLabel = document.getElementById('list-button-label');

const countdownTimerDisplay = document.getElementById('countdown-timer');

// NOWE ELEMENTY DOM
const ledIndicator = document.getElementById('led-indicator');
const bpmDisplay = document.getElementById('bpm-display');

let socket;
let isAdmin = false;
let metronomeIntervalId = null; // Zmienna do przechowywania ID interwału metronomu

const RENDER_SERVER_URL = 'wss://cogramy.onrender.com';

// Funkcja skracająca komunikaty
function shortenMessage(message, maxLength = 35) { // Domyślna długość, możesz dostosować
    if (message.length > maxLength) {
        return message.substring(0, maxLength - 3) + '...';
    }
    return message;
}

function updateAdminMessage(text, color = 'black', show = true) {
    if (!adminMessage || !messageSection) {
        console.error("[updateAdminMessage ERROR] Brak elementów DOM adminMessage lub messageSection!");
        return;
    }

    // Skróć tekst przed ustawieniem
    adminMessage.textContent = shortenMessage(text);
    adminMessage.style.color = color;

    const hasText = text.trim() !== '';

    if (show && hasText) {
        messageSection.classList.remove('hidden');
    } else {
        messageSection.classList.add('hidden');
    }
}

// Funkcja do wyodrębniania BPM z tekstu
function extractBPM(text) {
    const match = text.match(/\((\d{1,3})\)/); // Szuka liczby 1-3 cyfrowej w nawiasach
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    return null; // Zwróć null, jeśli nie znaleziono BPM
}

// Funkcja do sterowania metronomem (diodą LED)
function startMetronome(bpm) {
    // Najpierw zatrzymaj poprzedni metronom, jeśli działa
    if (metronomeIntervalId) {
        clearInterval(metronomeIntervalId);
        metronomeIntervalId = null;
    }
    ledIndicator.style.backgroundColor = 'white'; // Upewnij się, że dioda jest biała na początku
    ledIndicator.style.boxShadow = '0 0 5px white'; // Upewnij się, że cień jest biały na początku

    if (bpm && bpm > 0) {
        const intervalTime = (60 / bpm) * 1000; // Czas w milisekundach na jedno mignięcie
        
        // Upewnij się, że dioda LED jest widoczna
        ledIndicator.style.opacity = '1';

        metronomeIntervalId = setInterval(() => {
            // Mignięcie: na chwilę jaśniej, potem z powrotem do normalnego stanu
            ledIndicator.style.backgroundColor = 'red'; // Zmień kolor na czerwony podczas mignięcia
            ledIndicator.style.boxShadow = '0 0 15px red'; // Zwiększ cień podczas mignięcia
            setTimeout(() => {
                ledIndicator.style.backgroundColor = 'white'; // Wróć do białego
                ledIndicator.style.boxShadow = '0 0 5px white'; // Wróć do normalnego cienia
            }, 100); // Mignięcie trwa 100ms
        }, intervalTime);
    } else {
        // Jeśli BPM to 0 lub null, upewnij się, że dioda jest wyłączona/nieaktywna
        ledIndicator.style.opacity = '0.5'; // Lekko przyciemnij
        ledIndicator.style.backgroundColor = 'white'; // Resetuj kolor
        ledIndicator.style.boxShadow = 'none'; // Usuń cień
        bpmDisplay.textContent = ''; // Wyczyść wyświetlacz BPM
    }
}


function connectWebSocket() {
    socket = new WebSocket(RENDER_SERVER_URL);

    socket.onopen = () => {
        console.log('Połączono z serwerem WebSocket');
        updateAdminMessage('Połączono z serwerem.', 'green');
        // Połączony klient domyślnie jest nieautoryzowany, pokaż panel admina
        adminPanel.classList.remove('hidden-panel');
        keypadButtons.classList.add('hidden');
        fileContentSection.classList.add('hidden');
        isAdmin = false; // Resetuj stan isAdmin przy ponownym połączeniu
        display.textContent = ''; // Wyczyść wyświetlacz po połączeniu
        countdownTimerDisplay.textContent = ''; // Wyczyść timer
        bpmDisplay.textContent = ''; // Wyczyść BPM
        startMetronome(0); // Zatrzymaj metronom
    };

    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.type === 'displayUpdate') {
            display.textContent = message.value;
            // Zaktualizuj BPM i metronom po aktualizacji wyświetlacza
            const bpm = extractBPM(message.value);
            if (bpm !== null) {
                bpmDisplay.textContent = String(bpm).padStart(3, '0'); // Wyświetl BPM z wiodącymi zerami
                startMetronome(bpm);
            } else {
                bpmDisplay.textContent = ''; // Wyczyść, jeśli nie ma BPM
                startMetronome(0); // Zatrzymaj metronom
            }
        } else if (message.type === 'authResponse') {
            if (message.success) {
                isAdmin = true;
                adminPanel.classList.add('hidden-panel');
                keypadButtons.classList.remove('hidden');
                updateAdminMessage('Autoryzacja udana. Witaj Adminie!', 'green');
            } else {
                isAdmin = false;
                updateAdminMessage('Błędne hasło!', 'red', true);
            }
        } else if (message.type === 'message') {
            updateAdminMessage(message.text, 'red', true);
        } else if (message.type === 'resetConfirmed') {
            updateAdminMessage('Wyświetlacz zresetowany.', 'green');
            bpmDisplay.textContent = ''; // Wyczyść BPM
            startMetronome(0); // Zatrzymaj metronom
        } else if (message.type === 'countUpUpdate') {
            countdownTimerDisplay.textContent = message.value;
        } else if (message.type === 'fileContent') {
            // Po otrzymaniu zawartości pliku, ukryj klawiaturę i pokaż listę
            keypadButtons.classList.add('hidden');
            fileContentSection.classList.remove('hidden');
            fileContentSection.innerHTML = ''; // Wyczyść poprzednią zawartość

            message.content.split('\\n').forEach(line => {
                const item = document.createElement('div');
                item.classList.add('list-item');
                item.textContent = line;
                item.onclick = () => {
                    if (isAdmin) {
                        // Wyślij wybrany element do serwera do aktualizacji displaya
                        socket.send(JSON.stringify({ type: 'updateDisplay', value: line }));
                        updateAdminMessage(`Wybrano: ${shortenMessage(line)}`, 'blue');
                        // Po wyborze elementu, ukryj listę i pokaż klawiaturę
                        fileContentSection.classList.add('hidden');
                        keypadButtons.classList.remove('hidden');
                    } else {
                        updateAdminMessage('Brak uprawnień do wybierania z listy.', 'red', true);
                    }
                };
                fileContentSection.appendChild(item);
            });
            updateAdminMessage('Lista załadowana. Wybierz utwór.', 'blue');
        }
    };

    socket.onclose = () => {
        console.log('Rozłączono z serwerem WebSocket. Próba ponownego połączenia za 5 sekund...');
        updateAdminMessage('Rozłączono. Ponowne łączenie...', 'red', true);
        isAdmin = false; // Resetuj stan isAdmin
        adminPanel.classList.remove('hidden-panel'); // Pokaż panel logowania
        keypadButtons.classList.add('hidden'); // Ukryj klawiaturę
        fileContentSection.classList.add('hidden'); // Ukryj listę plików
        display.textContent = ''; // Wyczyść wyświetlacz
        countdownTimerDisplay.textContent = ''; // Wyczyść timer
        bpmDisplay.textContent = ''; // Wyczyść BPM
        startMetronome(0); // Zatrzymaj metronom
        setTimeout(connectWebSocket, 5000);
    };

    socket.onerror = error => {
        console.error('Błąd WebSocket:', error);
        updateAdminMessage('Błąd połączenia. Sprawdź konsolę.', 'red', true);
    };
}

function attemptAdminLogin() {
    const secretCode = secretCodeInput.value;
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'auth', code: secretCode }));
        secretCodeInput.value = ''; // Wyczyść pole hasła
    } else {
        updateAdminMessage('Brak połączenia z serwerem.', 'red', true);
    }
}

function appendToDisplay(char) {
    if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
        let charToSend = char;
        if (char === 'I') {
            charToSend = ' Instr.';
        } else if (char === 'W') {
            charToSend = ' Wokal';
        }
        socket.send(JSON.stringify({ type: 'input', value: charToSend }));
        updateAdminMessage('', '', false);
    } else if (!isAdmin) {
        updateAdminMessage('Tylko uprawnieni użytkownicy mogą wprowadzać znaki.', 'red', true);
    } else {
        updateAdminMessage('Brak połączenia z serwerem.', 'red', true);
    }
}

function clearDisplay() {
    if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
        socket.send(JSON.stringify({ type: 'reset' }));
        updateAdminMessage('', '', false);
    } else if (!isAdmin) {
        updateAdminMessage('Tylko uprawnieni użytkownicy mogą resetować wyświetlacz.', 'red', true);
    } else {
        updateAdminMessage('Brak połączenia z serwerem.', 'red', true);
    }
}

document.addEventListener('keydown', (event) => {
    if (!isAdmin) return;

    const key = event.key.toUpperCase();
    if (/[0-9]/.test(key)) {
        appendToDisplay(key);
    } else if (key === 'I') {
        // Wysyłamy 'I', a funkcja appendToDisplay() zamieni to na ' Instr.'
        appendToDisplay('I');
    } else if (key === 'W') {
        // Wysyłamy 'W', a funkcja appendToDisplay() zamieni to na ' Wokal'
        appendToDisplay('W');
    } else if (event.key === 'Backspace') {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'backspace' }));
            updateAdminMessage('', '', false);
        }
    }
});

// Obsługa przycisku "Lista"
listButtonLabel.addEventListener('click', () => {
    if (!isAdmin) {
        updateAdminMessage('Tylko uprawnieni użytkownicy mogą ładować listy.', 'red', true);
        return;
    }
    // Użyj prawdziwego kliknięcia na ukrytym input file
    fileInput.click();
});

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    if (file.type !== 'text/plain') {
        updateAdminMessage('Proszę wybrać plik tekstowy (.txt).', 'red', true);
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const fileContent = e.target.result;
        if (socket && socket.readyState === WebSocket.OPEN) {
            // Wyślij zawartość pliku do serwera
            socket.send(JSON.stringify({ type: 'fileUpload', content: fileContent }));
            updateAdminMessage('Plik wysłany. Oczekiwanie na listę...', 'blue');
        } else {
            updateAdminMessage('Brak połączenia z serwerem.', 'red', true);
        }
    };
    reader.onerror = (e) => {
        console.error('Błąd odczytu pliku:', e);
        updateAdminMessage('Błąd odczytu pliku.', 'red', true);
    };
    reader.readAsText(file);
});

// Funkcja do przełączania trybu pełnoekranowego
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Błąd wejścia w tryb pełnoekranowy: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// Inicjacja połączenia WebSocket po załadowaniu DOM
document.addEventListener('DOMContentLoaded', connectWebSocket);
