// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCXUByWccNg_Ao29j4P0xofDnRDkqw6uok",
    authDomain: "contexto-multiplayer.firebaseapp.com",
    databaseURL: "https://contexto-multiplayer-default-rtdb.firebaseio.com/",
    projectId: "contexto-multiplayer",
    storageBucket: "contexto-multiplayer.firebasestorage.app",
    messagingSenderId: "302542192118",
    appId: "1:302542192118:web:d5f86b4077230aa78d1bd7"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// --- ESTADO LOCAL GLOBAL ---
let roomID = "";
let myRole = ""; 
let opponentRole = "";
let targetWord = ""; 

// Banco de dados carregado dinamicamente via arquivo externo
let DICIONARIO_COMPLETO = {};

// --- CARREGAR DICIONÁRIO EXTERNO ---
// Carrega o arquivo JSON local ou de uma URL pública do GitHub
function carregarDicionarioEIniciar(role) {
    const urlDicionario = "palavras_contexto.json"; // Se subir pro github, pode ser o caminho relativo ou a URL do raw

    fetch(urlDicionario)
        .then(response => response.json())
        .then(data => {
            DICIONARIO_COMPLETO = data.partidas;
            console.log("Dicionário de contextos carregado com sucesso!");
            // Após carregar o dicionário, prossegue para entrar na sala
            executarEntradaNaSala(role);
        })
        .catch(error => {
            console.error("Erro ao carregar o dicionário público:", error);
            alert("Erro ao carregar os dados do jogo. Verifique sua conexão.");
        });
}

// Sorteia uma palavra contida no arquivo JSON público
function getRandomTargetWord() {
    const palavrasDisponiveis = Object.keys(DICIONARIO_COMPLETO);
    const indiceAleatorio = Math.floor(Math.random() * palavrasDisponiveis.length);
    return palavrasDisponiveis[indiceAleatorio];
}

// Retorna a proximidade usando o nó da palavra ativa carregada do arquivo externo
function getContextDistance(word) {
    const cleanWord = word.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos
    const cleanTarget = targetWord.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (cleanWord === cleanTarget) return 1;
    
    // Busca o contexto da palavra secreta ativa no arquivo baixado
    const contextoAtivo = DICIONARIO_COMPLETO[targetWord];
    
    if (contextoAtivo && contextoAtivo[cleanWord]) {
        return contextoAtivo[cleanWord];
    }
    
    // Penalidade caso não esteja no grupo semântico mapeado
    return 8000 + Math.floor(Math.random() * 4000);
}

// --- LOGICA DE ACESSO MULTIPLAYER ---
function joinRoom(role) {
    const roomInput = document.getElementById("room-input").value.trim();
    if (!roomInput) {
        alert("Insira um nome ou código identificador para a sala.");
        return;
    }
    roomID = roomInput;

    // Primeiro baixa o dicionário público, depois valida a sala
    carregarDicionarioEIniciar(role);
}

function ejecutarEntradaNaSala(role) {
    myRole = role;
    opponentRole = role === "player1" ? "player2" : "player1";

    document.getElementById("display-room-id").innerText = roomID;
    document.getElementById("display-player-role").innerText = role === "player1" ? "Jogador 1 (Azul)" : "Jogador 2 (Rosa)";

    if (myRole === "player1") {
        database.ref(`rooms/${roomID}`).once('value', (snapshot) => {
            if (!snapshot.exists()) {
                // Seleciona uma palavra totalmente aleatória extraída do JSON baixado
                const palavraSelecionada = getRandomTargetWord();
                
                database.ref(`rooms/${roomID}`).set({
                    currentTurn: "player1",
                    winner: "",
                    targetWord: palavraSelecionada
                });
            }
        });
    }

    document.getElementById("lobby-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");

    startRealtimeListeners();
}

// --- ESCUTADORES EM TEMPO REAL ---
function startRealtimeListeners() {
    database.ref(`rooms/${roomID}`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        if (data.targetWord) targetWord = data.targetWord;

        if (data.winner) {
            handleEndGame(data.winner);
            return;
        }

        handleTurnManagement(data.currentTurn);
    });

    database.ref(`rooms/${roomID}/guesses`).on('value', (snapshot) => {
        const container = document.getElementById("words-list-container");
        container.innerHTML = "";

        if (!snapshot.exists()) {
            container.innerHTML = `<p class="empty-msg">Nenhum palpite enviado ainda nesta partida.</p>`;
            return;
        }

        const guessesArray = [];
        snapshot.forEach((childSnapshot) => {
            guessesArray.push(childSnapshot.val());
        });
        
        guessesArray.reverse();

        guessesArray.forEach((guessData) => {
            const entry = document.createElement("div");
            entry.className = `word-entry ${guessData.player === "player1" ? "from-p1" : "from-p2"}`;
            
            const tag = guessData.player === "player1" ? "J1" : "J2";
            entry.innerHTML = `
                <span><strong>[${tag}]</strong> ${guessData.word}</span>
                <span class="rank-badge">${guessData.rank === 1 ? "⭐ ACERTOU!" : "Rank: " + guessData.rank}</span>
            `;
            container.appendChild(entry);
        });
    });
}

// --- GERENCIADOR DE INTERFACE POR TURNOS ---
function handleTurnManagement(currentTurn) {
    const inputField = document.getElementById("word-input");
    const submitBtn = document.getElementById("btn-submit");
    const turnMessage = document.getElementById("turn-message");

    const p1Panel = document.getElementById("panel-player1");
    const p2Panel = document.getElementById("panel-player2");
    const p1Status = document.getElementById("status-player1");
    const p2Status = document.getElementById("status-player2");

    if (currentTurn === "player1") {
        p1Panel.classList.add("active");
        p2Panel.classList.remove("active");
        p1Status.innerText = "Sua Vez";
        p2Status.innerText = "Aguardando";
    } else {
        p1Panel.classList.remove("active");
        p2Panel.classList.add("active");
        p1Status.innerText = "Aguardando";
        p2Status.innerText = "Sua Vez";
    }

    if (currentTurn === myRole) {
        inputField.disabled = false;
        submitBtn.disabled = false;
        turnMessage.innerText = "👉 É O SEU TURNO! Digite o seu palpite semântico.";
        turnMessage.style.color = myRole === "player1" ? "#1e88e5" : "#e53935";
        inputField.focus();
    } else {
        inputField.disabled = true;
        submitBtn.disabled = true;
        turnMessage.innerText = `⏳ Turno do Oponente (${currentTurn === "player1" ? "Jogador 1" : "Jogador 2"})...`;
        turnMessage.style.color = "#57606f";
    }
}

// --- ENVIO DO PALPITE ---
function sendGuess() {
    const inputField = document.getElementById("word-input");
    const wordGuessed = inputField.value.trim().toLowerCase();

    if (!wordGuessed) return;

    inputField.disabled = true;
    document.getElementById("btn-submit").disabled = true;

    const calculatedRank = getContextDistance(wordGuessed);
    const newGuessRef = database.ref(`rooms/${roomID}/guesses`).push();
    const updates = {};
    
    updates[`rooms/${roomID}/guesses/${newGuessRef.key}`] = {
        word: wordGuessed,
        player: myRole,
        rank: calculatedRank,
        timestamp: Date.now()
    };

    // Valida com tratamento de string limpa (sem acentos)
    const cleanGuessed = wordGuessed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cleanTarget = targetWord.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (cleanGuessed === cleanTarget) {
        updates[`rooms/${roomID}/winner`] = myRole;
    } else {
        updates[`rooms/${roomID}/currentTurn`] = opponentRole;
    }

    database.ref().update(updates).then(() => {
        inputField.value = "";
    }).catch(err => {
        console.error("Falha na sincronização: ", err);
    });
}

// --- FIM DE JOGO ---
function handleEndGame(winner) {
    const turnMessage = document.getElementById("turn-message");
    document.getElementById("word-input").disabled = true;
    document.getElementById("btn-submit").disabled = true;

    if (winner === myRole) {
        turnMessage.innerHTML = "🎉 VOCÊ VENCEU! Você decifrou a palavra semântica secreta da rodada!";
        turnMessage.style.color = "#2ed573";
    } else {
        turnMessage.innerHTML = "💥 FIM DE JOGO! O oponente acertou a palavra secreta primeiro.";
        turnMessage.style.color = "#ff4757";
    }
}
