// --- CONFIGURAÇÃO DO FIREBASE ---
// Subistatua pelos dados que você copiou do seu Console Firebase!
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
    projectId: "SEU_PROJETO",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "SEU_ID",
    appId: "SEU_APP_ID"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// --- ESTADO LOCAL DO JOGO ---
let roomID = "";
let myRole = ""; // 'player1' ou 'player2'
let opponentRole = "";
let targetWord = "parede"; // Palavra oculta padrão para este exemplo

// Simulação local de um banco de dados de distâncias contextuais 
// Em um jogo completo, você pode expandir esse objeto JSON com milhares de palavras
const mockContextDistances = {
    "parede": 1,
    "muro": 3,
    "tijolo": 8,
    "pintura": 15,
    "quadro": 42,
    "casa": 68,
    "janela": 95,
    "painel": 110,
    "desenho": 320,
    "manual": 1540,
    "carro": 4500,
    "computador": 8900
};

// Função para calcular a similaridade (Opção Estática Embutida)
function getContextDistance(word) {
    const cleanWord = word.trim().toLowerCase();
    if (cleanWord === targetWord) return 1;
    // Se a palavra existir no nosso dicionário, retorna a distância, se não, dá um valor alto padrão
    return mockContextDistances[cleanWord] || (10000 + Math.floor(Math.random() * 5000));
}

// --- CONECTAR E ENTRAR NA SALA ---
function joinRoom(role) {
    const roomInput = document.getElementById("room-input").value.trim();
    if (!roomInput) {
        alert("Por favor, digite um nome ou código para a sala.");
        return;
    }

    roomID = roomInput;
    myRole = role;
    opponentRole = role === "player1" ? "player2" : "player1";

    document.getElementById("display-room-id").innerText = roomID;
    document.getElementById("display-player-role").innerText = role === "player1" ? "Jogador 1 (Azul)" : "Jogador 2 (Rosa)";

    // Se for o Jogador 1, vamos inicializar a sala no Firebase se ela não existir
    if (myRole === "player1") {
        database.ref(`rooms/${roomID}`).once('value', (snapshot) => {
            if (!snapshot.exists()) {
                database.ref(`rooms/${roomID}`).set({
                    currentTurn: "player1",
                    winner: "",
                    targetWord: targetWord
                });
            }
        });
    }

    // Alternar telas na interface
    document.getElementById("lobby-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");

    // Iniciar escuta em tempo real da sala
    startRealtimeListeners();
}

// --- ESCUTADORES EM TEMPO REAL (FIREBASE) ---
function startRealtimeListeners() {
    // 1. Escutar alterações de Turno e Vitória Geral
    database.ref(`rooms/${roomID}`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Se houver uma palavra alvo definida pelo servidor da sala, sincronizamos localmente
        if (data.targetWord) targetWord = data.targetWord;

        // Verificar se alguém ganhou
        if (data.winner) {
            handleEndGame(data.winner);
            return;
        }

        // Gerenciar alternância de Turnos
        handleTurnManagement(data.currentTurn);
    });

    // 2. Escutar novas palavras adicionadas na lista (Histórico Compartilhado)
    database.ref(`rooms/${roomID}/guesses`).on('value', (snapshot) => {
        const container = document.getElementById("words-list-container");
        container.innerHTML = ""; // Limpa para renderizar atualizado

        if (!snapshot.exists()) {
            container.innerHTML = `<p class="empty-msg">Nenhum palpite enviado ainda nesta partida.</p>`;
            return;
        }

        let hasGuesses = false;
        // Transformar objeto em array e ordenar do mais recente para o mais antigo
        const guessesArray = [];
        snapshot.forEach((childSnapshot) => {
            guessesArray.push(childSnapshot.val());
            hasGuesses = true;
        });
        
        guessesArray.reverse(); // Últimos palpites primeiro no topo

        guessesArray.forEach((guessData) => {
            const entry = document.createElement("div");
            entry.className = `word-entry ${guessData.player === "player1" ? "from-p1" : "from-p2"}`;
            
            const playerTag = guessData.player === "player1" ? "J1" : "J2";
            entry.innerHTML = `
                <span><strong>[${playerTag}]</strong> ${guessData.word}</span>
                <span class="rank-badge">${guessData.rank === 1 ? "⭐ ACERTOU!" : "Rank: " + guessData.rank}</span>
            `;
            container.appendChild(entry);
        });
    });
}

// --- CONTROLAR QUEM JOGA AGORA ---
function handleTurnManagement(currentTurn) {
    const inputField = document.getElementById("word-input");
    const submitBtn = document.getElementById("btn-submit");
    const turnMessage = document.getElementById("turn-message");

    const p1Panel = document.getElementById("panel-player1");
    const p2Panel = document.getElementById("panel-player2");
    const p1Status = document.getElementById("status-player1");
    const p2Status = document.getElementById("status-player2");

    // Atualizar painéis visuais superiores
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

    // Habilitar ou Bloquear o campo dependendo se é a vez do usuário atual
    if (currentTurn === myRole) {
        inputField.disabled = false;
        submitBtn.disabled = false;
        turnMessage.innerText = "👉 É O SEU TURNO! Faça o seu palpite semântico.";
        turnMessage.style.color = myRole === "player1" ? "#1e88e5" : "#e53935";
    } else {
        inputField.disabled = true;
        submitBtn.disabled = true;
        turnMessage.innerText = `⏳ Turno do Oponente (${currentTurn === "player1" ? "Jogador 1" : "Jogador 2"})...`;
        turnMessage.style.color = "#57606f";
    }
}

// --- ENVIAR UM PALPITE ---
function sendGuess() {
    const inputField = document.getElementById("word-input");
    const wordGuessed = inputField.value.trim().toLowerCase();

    if (!wordGuessed) return;

    // Bloqueia preventivo local para não clicar duas vezes rápido
    inputField.disabled = true;
    document.getElementById("btn-submit").disabled = true;

    // 1. Calcula o ranking de distância contextualmente
    const calculatedRank = getContextDistance(wordGuessed);

    // 2. Cria as atualizações do Firebase em lote atômico
    const newGuessRef = database.ref(`rooms/${roomID}/guesses`).push();
    const updates = {};
    
    // Grava o palpite na lista
    updates[`rooms/${roomID}/guesses/${newGuessRef.key}`] = {
        word: wordGuessed,
        player: myRole,
        rank: calculatedRank,
        timestamp: Date.now()
    };

    // 3. Verifica se acertou na mosca ou passa a vez
    if (wordGuessed === targetWord) {
        updates[`rooms/${roomID}/winner`] = myRole;
    } else {
        updates[`rooms/${roomID}/currentTurn`] = opponentRole; // PASSA A VEZ PRO OUTRO JOGADOR
    }

    // Envia tudo sincronizado para o Firebase
    database.ref().update(updates).then(() => {
        inputField.value = ""; // Limpa a barra de digitação
    }).catch(err => {
        console.error("Erro ao processar turno: ", err);
    });
}

// --- TRATAR TELA DE VITÓRIA ---
function handleEndGame(winner) {
    const turnMessage = document.getElementById("turn-message");
    document.getElementById("word-input").disabled = true;
    document.getElementById("btn-submit").disabled = true;

    if (winner === myRole) {
        turnMessage.innerHTML = "🎉 PARABÉNS! Você descobriu a palavra secreta e venceu o jogo!";
        turnMessage.style.color = "#2ed573";
    } else {
        turnMessage.innerHTML = "💥 FIM DE JOGO! Seu oponente adivinhou a palavra antes de você.";
        turnMessage.style.color = "#ff4757";
    }
}
