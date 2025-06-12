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
            // ZMODYFIKOWANA LINIA: Powrót do textContent, ponieważ nie ma już formatowania HTML
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
            // Po resecie, upewnij się, że display jest czysty
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
            if (fileContentSection.children.length > 0) {
                fileContentSection.classList.remove('hidden');
            }
        });
    }

    fileInput.addEventListener('change', (event) => {
        if (!isAdmin) {
            updateAdminMessage('Tylko uprawnieni użytkownicy mogą ładować listy.', 'red', true);
            fileInput.value = '';
            fileContentSection.classList.add('hidden');
            return;
        }

        const file = event.target.files[0];
        if (file) {
            if (file.type && !file.type.startsWith('text/')) {
                updateAdminMessage('Proszę wybrać plik tekstowy (.txt).', 'red', true);
                fileContentSection.classList.add('hidden');
                fileInput.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const fileContent = e.target.result;
                fileContentSection.innerHTML = '';

                const lines = fileContent.split('\n');
                let lineNumber = 0;
                lines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.length > 0) {
                        lineNumber++;

                        const lineDiv = document.createElement('div');
                        lineDiv.classList.add('list-item');

                        const formattedNumber = String(lineNumber).padStart(2, '0') + '. ';
                        
                        lineDiv.textContent = formattedNumber + trimmedLine;
                        lineDiv.dataset.displayContent = formattedNumber + trimmedLine;

                        lineDiv.addEventListener('click', () => {
                            if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
                                // Wysyłamy do serwera surowy tekst z listy
                                socket.send(JSON.stringify({ type: 'updateDisplay', value: lineDiv.dataset.displayContent }));
                                fileInput.value = '';
                                updateAdminMessage('', '', false);
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
                    fileContentSection.classList.remove('hidden');
                } else {
                    fileContentSection.classList.add('hidden');
                    updateAdminMessage('Plik jest pusty lub nie zawiera poprawnych linii.', 'orange', true);
                }

                fileInput.value = '';
            };
            reader.onerror = () => {
                updateAdminMessage('Błąd odczytu pliku.', 'red', true);
                fileContentSection.classList.add('hidden');
                fileInput.value = '';
            };
            reader.readAsText(file);
        } else {
            updateAdminMessage('', '', false);
        }
    });
});

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


function attemptAdminLogin() {
    const code = secretCodeInput.value;
    updateAdminMessage('', '', false);
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'auth', code: code }));
    } else {
        updateAdminMessage('Nie połączono z serwerem. Próbuję ponownie...', 'red', true);
        connectWebSocket();
    }
}

// Funkcja formatDisplayText ZOSTAŁA USUNIĘTA

// Zmodyfikowana funkcja appendToDisplay
function appendToDisplay(char) {
    if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
        let charToSend = char;
        if (char === 'I') {
            charToSend = ' Instr.'; // Zmieniono na " Instr."
        } else if (char === 'W') {
            charToSend = ' Wokal'; // Pozostaje " Wokal"
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
        if (socket && socket.readyState === WebSocket.OPEN && isAdmin) {
            socket.send(JSON.stringify({ type: 'backspace' }));
        }
    } else if (event.key === 'Delete') {
        clearDisplay();
    }
});
