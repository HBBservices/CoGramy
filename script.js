const display = document.getElementById('display');
const adminPanel = document.getElementById('admin-panel');
const secretCodeInput = document.getElementById('secret-code-input');
const keypadButtons = document.getElementById('keypad-buttons');
const adminMessage = document.getElementById('admin-message');
const messageSection = document.getElementById('message-section');

const fileInput = document.getElementById('file-input');
const fileContentSection = document.getElementById('file-content-section');
const listButtonLabel = document.getElementById('list-button-label');

const countdownTimerDisplay = document.getElementById('countdown-timer'); // Referencja do elementu timera

let socket;
let isAdmin = false;

// Zaktualizowany URL dla nowego Web Service na Renderze "CoGramy"
const RENDER_SERVER_URL = 'wss://cogramy.onrender.com'; // Zmień na 'wss://TwojaNazwaUslugi.onrender.com'

function updateAdminMessage(text, color = 'black', show = true) {
    if (!adminMessage || !messageSection) {
        console.error("[updateAdminMessage ERROR] Brak elementów DOM adminMessage lub messageSection!");
        return;
    }

    adminMessage.textContent = text;
    adminMessage.style.color = color;

    const hasText = text.trim() !== '';

    if (show && hasText) {
        messageSection.classList.remove('hidden');
    } else {
        messageSection.classList.add('hidden');
    }
}

// Funkcja WYWOŁYWANA PRZEZ WIADOMOŚĆ Z SERWERA, aby zaktualizować licznik (teraz liczy w górę)
function updateCountUpDisplay(time) {
    if (time > 0 && time <= 60) { // Zegar jest widoczny tylko, gdy liczy od 1 do 60
        countdownTimerDisplay.textContent = time;
        countdownTimerDisplay.classList.remove('hidden'); // Upewnij się, że jest widoczny
    } else { // Jeśli czas to 0 (po resecie) lub poza zakresem, ukryj zegar
        countdownTimerDisplay.textContent = ''; // Wyczyść tekst
        countdownTimerDisplay.classList.add('hidden'); // Ukryj element
    }
}

function connectWebSocket() {
    // Sprawdź, czy socket już istnieje i jest otwarty, aby uniknąć wielokrotnych połączeń
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('Socket już otwarty, nie nawiązuję nowego połączenia.');
        return;
    }
    // Jeśli socket istnieje, ale jest w stanie CLOSING lub CLOSED, ustaw na null przed utworzeniem nowego
    if (socket && (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED)) {
        socket = null;
    }


    socket = new WebSocket(RENDER_SERVER_URL);

    socket.onopen = () => {
        console.log('Połączono z serwerem WebSocket na Renderze');
        updateAdminMessage('', 'green', false);
        // Po ponownym połączeniu, stan displaya i timera zostanie wysłany przez serwer,
        // więc nie musimy ich tutaj czyścić ani ustawiać.
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'displayUpdate') {
            display.textContent = message.value;
        } else if (message.type === 'authResponse') {
            if (message.success) {
                isAdmin = true;
                adminPanel.classList.add('hidden');
                keypadButtons.classList.remove('hidden');
                // NIE UKRYWAMY fileContentSection tutaj po autoryzacji
                updateAdminMessage('', 'green', false); // Wyczyść komunikat
            } else {
                isAdmin = false;
                updateAdminMessage('Nieprawidłowy kod. Spróbuj ponownie.', 'red', true);
            }
        } else if (message.type === 'countUpUpdate') {
            updateCountUpDisplay(message.value);
        } else if (message.type === 'resetConfirmed') {
            display.textContent = '';
            updateCountUpDisplay(0); // Wyczyść licznik i UKRYJ go
        } else if (message.type === 'message') {
            updateAdminMessage(message.text, 'red', true);
        }
    };

    socket.onclose = (event) => {
        console.log('Rozłączono z serwerem WebSocket:', event.code, event.reason);
        isAdmin = false;
        adminPanel.classList.remove('hidden');
        keypadButtons.classList.add('hidden'); // Ukryj klawiaturę
        fileContentSection.classList.add('hidden'); // UKRYJ sekcję pliku po rozłączeniu (tutaj ma sens)
        updateAdminMessage('Rozłączono. Próba ponownego połączenia...', 'orange', true);
        updateCountUpDisplay(0); // Wyczyść licznik i UKRYJ go po rozłączeniu
        setTimeout(connectWebSocket, 3000); // Spróbuj ponownie połączyć po 3 sekundach
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
        updateAdminMessage('Wystąpił błąd połączenia. Sprawdź konsolę.', 'red', true);
        updateCountUpDisplay(0); // Wyczyść licznik i UKRYJ go w przypadku błędu
        socket.close(); // Zamknij socket po błędzie, aby wywołać onclose i próbę ponownego połączenia
    };
}

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();

    secretCodeInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' || event.keyCode === 13) {
            event.preventDefault();
            attemptAdminLogin();
        }
    });

    if (listButtonLabel) {
        listButtonLabel.addEventListener('click', (event) => {
            if (!isAdmin) {
                event.preventDefault();
                updateAdminMessage('Tylko uprawnieni użytkownicy mogą ładować listy.', 'red', true);
                return;
            }
            updateAdminMessage('', '', false);
            // Po kliknięciu "Lista", zawsze pokazujemy sekcję, ale tylko jeśli jest załadowany plik.
            // Faktyczne pokazanie/ukrycie po załadowaniu pliku dzieje się w reader.onload
            if (fileContentSection.children.length > 0) {
                   fileContentSection.classList.remove('hidden');
            }
        });
    }

    fileInput.addEventListener('change', (event) => {
        if (!isAdmin) {
             updateAdminMessage('Tylko uprawnieni użytkownicy mogą ładować listy.', 'red', true);
             fileInput.value = ''; // Wyczyść input file
             fileContentSection.classList.add('hidden');
             return;
        }

        const file = event.target.files[0];
        if (file) {
            // Walidacja typu pliku
            if (file.type && !file.type.startsWith('text/')) {
                updateAdminMessage('Proszę wybrać plik tekstowy (.txt).', 'red', true);
                fileContentSection.classList.add('hidden');
                fileInput.value = ''; // Wyczyść input file, aby móc ponownie wybrać ten sam plik po błędzie
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const fileContent = e.target.result;
                fileContentSection.innerHTML = ''; // Wyczyść poprzednią zawartość

                const lines = fileContent.split('\n');
                let lineNumber = 0;
                lines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.length > 0) {
                        lineNumber++;

                        const lineDiv = document.createElement('div');
                        lineDiv.classList.add('list-item');

                        // Formatuj numer linii z wiodącymi zerami
                        const formattedNumber = String(lineNumber).padStart(2, '0') + '. ';
                        
                        lineDiv.textContent = formattedNumber + trimmedLine;
                        // Przechowaj oryginalną zawartość do wysłania na serwer
                        lineDiv.dataset.displayContent = formattedNumber + trimmedLine;

                        lineDiv.addEventListener('click', () => {
                            if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
                                // Wysyłamy wiadomość o aktualizacji do serwera
                                socket.send(JSON.stringify({ type: 'updateDisplay', value: lineDiv.dataset.displayContent }));
                                // Po wybraniu linii, NIE UKRYWAMY sekcji listy
                                fileInput.value = ''; // Wyczyść input file (bo plik został wybrany)
                                updateAdminMessage('', '', false); // Wyczyść komunikat
                            } else if (!isAdmin) {
                                updateAdminMessage('Tylko uprawnieni użytkownicy mogą zmieniać wyświetlacz.', 'red', true);
                            } else {
                                updateAdminMessage('Brak połączenia z serwerem.', 'red', true);
                            }
                        });
                        fileContentSection.appendChild(lineDiv);
                    }
                });

                if (fileContentSection.children.length > 0) {
                    fileContentSection.classList.remove('hidden'); // Pokaż sekcję, jeśli są linie
                } else {
                    fileContentSection.classList.add('hidden'); // Ukryj, jeśli plik jest pusty
                    updateAdminMessage('Plik jest pusty lub nie zawiera poprawnych linii.', 'orange', true);
                }

                fileInput.value = ''; // Wyczyść input file po załadowaniu
            };
            reader.onerror = () => {
                updateAdminMessage('Błąd odczytu pliku.', 'red', true);
                fileContentSection.classList.add('hidden');
                fileInput.value = ''; // Wyczyść input file
            };
            reader.readAsText(file);
        } else {
            // Jeśli użytkownik anulował wybór pliku lub nie wybrano żadnego
            // Nie ukrywamy, jeśli już jest widoczna z poprzedniego ładowania
            updateAdminMessage('', '', false); // Wyczyść komunikat, jeśli plik nie został wybrany
        }
    });
});

function attemptAdminLogin() {
    const code = secretCodeInput.value;
    updateAdminMessage('', '', false); // Wyczyść poprzednie komunikaty
    // NIE UKRYWAMY fileContentSection tutaj przy próbie logowania
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'auth', code: code }));
    } else {
        updateAdminMessage('Nie połączono z serwerem. Próbuję ponownie...', 'red', true);
        connectWebSocket(); // Spróbuj ponownie połączyć, jeśli nie ma połączenia
    }
}

function appendToDisplay(char) {
    if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
        // Wysyłamy wiadomość o wprowadzeniu danych do serwera
        socket.send(JSON.stringify({ type: 'input', value: char }));
        updateAdminMessage('', '', false); // Wyczyść komunikat
        // NIE UKRYWAMY fileContentSection tutaj po wprowadzeniu danych
    } else if (!isAdmin) {
        updateAdminMessage('Tylko uprawnieni użytkownicy mogą wprowadzać znaki.', 'red', true);
    } else {
        updateAdminMessage('Brak połączenia z serwerem.', 'red', true);
    }
}

function clearDisplay() {
    if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
        // Wysyłamy żądanie resetu do serwera
        socket.send(JSON.stringify({ type: 'reset' }));
        updateAdminMessage('', '', false); // Wyczyść komunikat
        // NIE UKRYWAMY fileContentSection tutaj po resecie
    } else if (!isAdmin) {
        updateAdminMessage('Tylko uprawnieni użytkownicy mogą resetować wyświetlacz.', 'red', true);
    } else {
        updateAdminMessage('Brak połączenia z serwerem.', 'red', true);
    }
}

// Obsługa klawiatury dla admina
document.addEventListener('keydown', (event) => {
    if (!isAdmin) return; // Tylko admin może używać klawiatury

    const key = event.key.toUpperCase(); // Konwertuj na dużą literę
    if (/[0-9IW]/.test(key)) {
        appendToDisplay(key);
    } else if (event.key === 'Backspace') {
        // Aby obsłużyć Backspace, potrzebujesz nowej wiadomości do serwera
        // Serwer musiałby wtedy skrócić `currentDisplayValue` o jeden znak.
        // Poniżej tylko log konsoli, żebyś wiedział, że przycisk działa.
        console.log("Backspace pressed - wymaga implementacji na serwerze.");
    } else if (event.key === 'Delete') {
        clearDisplay();
    }
});
