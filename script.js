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

let socket;
let isAdmin = false;

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

function updateCountUpDisplay(time) {
    if (time > 0 && time <= 60) {
        countdownTimerDisplay.textContent = time;
        countdownTimerDisplay.classList.remove('hidden');
    } else {
        countdownTimerDisplay.textContent = '';
        countdownTimerDisplay.classList.add('hidden');
    }
}

function connectWebSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('Socket już otwarty, nie nawiązuję nowego połączenia.');
        return;
    }
    if (socket && (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED)) {
        socket = null;
    }

    socket = new WebSocket(RENDER_SERVER_URL);

    socket.onopen = () => {
        console.log('Połączono z serwerem WebSocket na Renderze');
        updateAdminMessage('', 'green', false);
        adminPanel.classList.remove('hidden-panel'); // Panel jest domyślnie widoczny po starcie
    };

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'displayUpdate') {
            display.textContent = message.value;
        } else if (message.type === 'authResponse') {
            if (message.success) {
                isAdmin = true;
                adminPanel.classList.add('hidden-panel'); // Ukryj panel logowania po udanym logowaniu
                keypadButtons.classList.remove('hidden'); // Pokazujemy klawiaturę
                updateAdminMessage('', 'green', false);
                window.scrollTo({ top: 0, behavior: 'instant' });
            } else {
                isAdmin = false;
                updateAdminMessage('Nieprawidłowy kod. Spróbuj ponownie.', 'red', true); // Ten komunikat zostanie skrócony
            }
        } else if (message.type === 'countUpUpdate') {
            updateCountUpDisplay(message.value);
        } else if (message.type === 'resetConfirmed') {
            display.textContent = '';
            updateCountUpDisplay(0);
        } else if (message.type === 'message') {
            updateAdminMessage(message.text, 'red', true); // Ten komunikat również zostanie skrócony
        }
    };

    socket.onclose = (event) => {
        console.log('Rozłączono z serwerem WebSocket:', event.code, event.reason);
        isAdmin = false;
        adminPanel.classList.remove('hidden-panel'); // Pokaż panel logowania po rozłączeniu
        keypadButtons.classList.add('hidden');
        fileContentSection.classList.add('hidden');
        updateAdminMessage('Rozłączono. Próba ponownego połączenia...', 'orange', true); // Ten komunikat zostanie skrócony
        updateCountUpDisplay(0);
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
        updateAdminMessage('Wystąpił błąd połączenia. Sprawdź konsolę.', 'red', true); // Ten komunikat zostanie skrócony
        updateCountUpDisplay(0);
        socket.close();
    };
}

// Funkcja dodająca znak do wyświetlacza (wywoływana przez przyciski)
function appendToDisplay(char) {
    if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
        let textToSend = char;

        // Tutaj dodajemy logikę spacji, aby była ona dodawana na froncie przed wysłaniem.
        // Sprawdzamy, czy display jest pusty, aby dodać spację tylko wtedy, gdy jest to pierwszy element,
        // albo jeśli nie jest pusty i ostatni znak to nie spacja.
        const currentDisplayText = display.textContent;
        const needsLeadingSpace = currentDisplayText.length > 0 && !currentDisplayText.endsWith(' ');
        
        // Dodaj spację tylko do "Instrumental" i "Wokal", jeśli potrzeba
        if ((char === 'Instrumental' || char === 'Wokal') && needsLeadingSpace) {
            textToSend = ' ' + char;
        }

        socket.send(JSON.stringify({ type: 'input', value: textToSend }));
        updateAdminMessage('', '', false);
    } else if (!isAdmin) {
        updateAdminMessage('Tylko uprawnieni użytkownicy mogą wprowadzać znaki.', 'red', true);
    } else {
        updateAdminMessage('Brak połączenia z serwerem.', 'red', true);
    }
}


// Funkcja obsługująca przycisk Reset
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

// Funkcja obsługująca Backspace (przytrzymanie przycisku)
function handleBackspace() {
    if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
        socket.send(JSON.stringify({ type: 'backspace' }));
        updateAdminMessage('', '', false);
    } else if (!isAdmin) {
        updateAdminMessage('Tylko uprawnieni użytkownicy mogą używać Backspace.', 'red', true);
    } else {
        updateAdminMessage('Brak połączenia z serwerem.', 'red', true);
    }
}

// Funkcje do obsługi pełnego ekranu
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Błąd wejścia w tryb pełnoekranowy: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
}

function attemptAdminLogin() {
    const code = secretCodeInput.value;
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'auth', code: code }));
    } else {
        updateAdminMessage('Brak połączenia z serwerem. Spróbuj ponownie za chwilę.', 'red', true);
    }
    secretCodeInput.value = ''; // Wyczyść pole po próbie logowania
}

document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();

    // Dodaj event listenery dla przycisków Reset i Backspace
    const resetButton = document.querySelector('.btn-reset');
    if (resetButton) {
        resetButton.onclick = clearDisplay; // Przypisanie funkcji clearDisplay
    }

    // Dla przycisku "0" dodajemy obsługę przytrzymania do Backspace
    const zeroButton = document.querySelector('.btn[onclick="appendToDisplay(\'0\')"]');
    if (zeroButton) {
        let pressTimer;
        const longPressDelay = 500; // Czas przytrzymania w ms, np. 500ms

        zeroButton.addEventListener('mousedown', (e) => {
            // Tylko dla lewego przycisku myszy
            if (e.button === 0) {
                pressTimer = setTimeout(() => {
                    handleBackspace(); // Wywołaj funkcję Backspace
                    // Opcjonalnie: zablokuj normalne zachowanie kliknięcia po długim naciśnięciu
                    zeroButton.dataset.longPress = 'true';
                }, longPressDelay);
            }
        });

        zeroButton.addEventListener('mouseup', () => {
            clearTimeout(pressTimer);
            if (zeroButton.dataset.longPress === 'true') {
                // Jeśli było długie naciśnięcie, resetuj flagę i nie appenduj '0'
                zeroButton.dataset.longPress = 'false';
                return;
            }
            // Normalne kliknięcie (jeśli nie było długiego naciśnięcia)
            appendToDisplay('0');
        });

        // Zapobieganie menu kontekstowemu na smartfonach
        zeroButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    // Obsługa Input File (przeniesiona z HTML do JS, aby logika była spójna)
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            if (!isAdmin) {
                updateAdminMessage('Tylko uprawnieni użytkownicy mogą ładować listy.', 'red', true);
                // Wyczyść input, aby nie wywołało się ponownie przy anulowaniu
                fileInput.value = '';
                return;
            }
            updateAdminMessage('', '', false); // Ukryj komunikat o błędzie
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const lines = e.target.result.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                    displayFileList(lines);
                };
                reader.readAsText(file);
            }
            fileInput.value = ''; // Wyczyść input po wyborze pliku
        });
    }

    if (listButtonLabel) {
        listButtonLabel.addEventListener('click', (event) => {
            if (!isAdmin) {
                // Ta logika jest już częścią listenera 'change' na fileInput, ale pozostawiamy ją tu dla dodatkowej kontroli
                event.preventDefault(); // Zapobiega otwarciu okna wyboru pliku
                updateAdminMessage('Tylko uprawnieni użytkownicy mogą ładować listy.', 'red', true);
                return;
            }
            // Jeśli już załadowano listę, po kliknięciu na 'Lista' pokaż ją/ukryj
            if (fileContentSection.children.length > 0) {
                fileContentSection.classList.toggle('hidden');
                updateAdminMessage('', '', false); // Ukryj komunikat o błędzie
            } else {
                // Jeśli lista jest pusta, to kliknięcie na label powinno wywołać kliknięcie na input file
                // To jest już domyślne zachowanie label dla input type="file"
            }
        });
    }


    // Funkcja do dynamicznego tworzenia listy z pliku
    function displayFileList(lines) {
        fileContentSection.innerHTML = ''; // Wyczyść poprzednią zawartość
        lines.forEach(line => {
            const div = document.createElement('div');
            div.classList.add('list-item');
            div.textContent = line;
            div.onclick = () => {
                if (isAdmin) {
                    if (socket && socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: 'updateDisplay', value: line }));
                        fileContentSection.classList.add('hidden'); // Ukryj listę po wybraniu
                        updateAdminMessage('', '', false); // Ukryj komunikat o błędzie
                    } else {
                        updateAdminMessage('Brak połączenia z serwerem. Nie można zaktualizować wyświetlacza.', 'red', true);
                    }
                } else {
                    updateAdminMessage('Tylko uprawnieni użytkownicy mogą aktualizować wyświetlacz.', 'red', true);
                }
            };
            fileContentSection.appendChild(div);
        });
        fileContentSection.classList.remove('hidden'); // Pokaż sekcję z listą
    }

    secretCodeInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' || event.keyCode === 13) {
            event.preventDefault();
            attemptAdminLogin();
        }
    });
});
