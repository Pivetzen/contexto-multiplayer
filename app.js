// --- CONFIGURAÇÃO DO FIREBASE ---
// Lembre-se de substituir com as suas credenciais reais do Firebase Console!
const firebaseConfig = {
    apiKey: "AIzaSyCXUByWccNg_Ao29j4P0xofDnRDkqw6uok",
    authDomain: "contexto-multiplayer.firebaseapp.com",
    databaseURL: "https://contexto-multiplayer-default-rtdb.firebaseio.com/",
    projectId: "contexto-multiplayer",
    storageBucket: "contexto-multiplayer.firebasestorage.app",
    messagingSenderId: "302542192118",
    appId: "1:302542192118:web:d5f86b4077230aa78d1bd7"
};

// Inicializando a conexão com a base de dados
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// --- ESTADO LOCAL GLOBAL ---
let roomID = "";
let myRole = ""; // 'player1' ou 'player2'
let opponentRole = "";
let targetWord = ""; // Será injetada dinamicamente via Firebase por rodada

// --- DICIONÁRIO DE PALAVRAS E DISTÂNCIAS CONTEXTUAIS (Expansível) ---
const JOGO_PALAVRAS = {
    "parede": {
        "muro": 3, "tijolo": 8, "pintura": 15, "quadro": 42, "casa": 68,
        "janela": 95, "painel": 110, "desenho": 320, "manual": 1540
    },
    "computador": {
        "notebook": 2, "teclado": 5, "mouse": 12, "tela": 20, "internet": 45,
        "programação": 60, "escritório": 90, "janela": 400, "cadeira": 600
    },
    "mercado": {
        "supermercado": 2, "compras": 6, "preço": 10, "caixa": 18, "comida": 35,
        "carrinho": 50, "dinheiro": 75, "feira": 120, "rua": 500
    },
    "cachorro": {
        "cão": 2, "gato": 10, "pet": 15, "ração": 22, "veterinário": 40,
        "animal": 55, "coleira": 70, "parque": 140, "lobo": 300
    }
};

// Escolha aleatória de palavras disparada apenas na criação da sala
function getRandomTargetWord() {
    const palavrasDisponiveis = Object.keys(JOGO_PALAVRAS);
    const indiceAleatorio = Math.floor(Math.random() * palavrasDisponiveis.length);
    return palavrasDisponiveis[indiceAleatorio];
}

// Retorna a proximidade contextual com base na palavra-alvo ativa
function getContextDistance(word) {
    const cleanWord = word.trim().toLowerCase();
    
    if (cleanWord === targetWord) return 1;
    
    const contextoAtivo = JOGO_PALAVRAS[targetWord];
    
    if (contextoAtivo && contextoAtivo[cleanWord]) {
        return contextoAtivo[cleanWord];
    }
    
    // Penalidade semântica padrão caso fuja totalmente do contexto estruturado
    return 8000 + Math.floor(Math.random() * 4000);
}

// --- LOGICA DE ACESSO À SALA MULTIPLAYER ---
function joinRoom(role) {
    const roomInput = document.getElementById("room-input").value.trim();
    if (!roomInput) {
        alert("Insira um nome ou código identificador para a sala.");
        return;
    }

    roomID = roomInput;
    myRole = role;
    opponentRole = role === "player1" ? "player2" : "player1";

    document.getElementById("display-room-id").innerText = roomID;
    document.getElementById("display-player-role").innerText = role === "player1" ? "Jogador 1 (Azul)" : "Jogador 2 (Rosa)";

    // Jogador 1 atua como o 'Host' definindo as variáveis iniciais da rodada
    if (myRole === "player1") {
        database.ref(`rooms/${roomID}`).once('value', (snapshot) => {
            if (!snapshot.exists()) {
                const palavraSelecionada = getRandomTargetWord();
                
                database.ref(`rooms/${roomID}`).set({
                    currentTurn: "player1",
                    winner: "",
                    targetWord: palavraSelecionada
                });
            }
        });
    }

    // Gerencia a troca de telas na DOM
    document.getElementById("lobby-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");

    // Aciona a sincronização em tempo real do Firebase
    startRealtimeListeners();
}

// --- ESCUTADORES EM TEMPO REAL ---
function startRealtimeListeners() {
    // Sincroniza dados estruturais da partida (Turno, Alvo e Vencedor)
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

    // Sincroniza a lista histórica de tentativas enviadas
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
        
        // Exibe os palpites mais recentes sempre no topo da pilha
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

    // Habilita ou desabilita os inputs baseado no papel do jogador atual
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

    // Bloqueio preventivo na UI para evitar requisições duplicadas
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

    // Avalia o critério de vitória ou passa a vez
    if (wordGuessed === targetWord) {
        updates[`rooms/${roomID}/winner`] = myRole;
    } else {
        updates[`rooms/${roomID}/currentTurn`] = opponentRole;
    }

    database.ref().update(updates).then(() => {
        inputField.value = "";
    }).catch(err => {
        console.error("Falha na sincronização dos dados: ", err);
    });
}

// --- FIM DE JOGO ---
function handleEndGame(winner) {
    const turnMessage = document.getElementById("turn-message");
    document.getElementById("word-input").disabled = true;
    document.getElementById("btn-submit").disabled = true;

    if (winner === myRole) {
        turnMessage.innerHTML = "🎉 VOCÊ VENCEU! Você decifrou a palavra semântica secreta!";
        turnMessage.style.color = "#2ed573";
    } else {
        turnMessage.innerHTML = "💥 FIM DE JOGO! O oponente acertou a palavra secreta antes.";
        turnMessage.style.color = "#ff4757";
    }
}
