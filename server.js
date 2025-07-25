const express = require("express");
const path = require("path");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 3000;
const admin = require("firebase-admin");
// const { verify } = require("crypto"); USAR FUTURAMENTE PARA VERIFICAR SE O USUÁRIO ESTÁ LOGADO
require("dotenv").config();

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
};

const databaseURL = process.env.FIREBASE_DATABASE_URL;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: databaseURL,
});

const db = admin.database();
const authAdmin = admin.auth();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/equipes", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pages", "equipes.html"));
});

app.get("/atendimento", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pages", "atendimento.html"));
});

app.get("/artes", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pages", "artes.html"));
});

app.get("/multimidia/foto-filmagem", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pages", "foto-filmagem.html"));
});

app.get("/multimidia/edicao", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pages", "edicao.html"));
});


app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

//Cadastrando usuário
app.post("/api/registrar", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email e senha obrigatórios." });
  }

  try {
    const userAuth = await authAdmin.createUser({
      email: email,
      password: password,
    });
    console.log("Usuário criado com UID: ", userAuth.uid);

    const customToken = await authAdmin.createCustomToken(userAuth.uid);
    res.status(201).json({
      customToken: customToken,
      message: "Usuário cadastrado e token gerado.",
    });
  } catch (error) {
    console.error("Erro ao cadastrar usuário: ", error.message);
    let errorMessage = "Erro ao cadastrar usuário.";
    if (error.code === "auth/email-already-exists") {
      errorMessage = "Email já está em uso.";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "A senha é muito fraca (mínimo de 6 caracteres).";
    }
    res.status(400).json({ message: errorMessage, error: error.message });
  }
});

//Logando
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email e senha obrigatórios." });
  }

  try {
    const apiKey = process.env.FIREBASE_API_KEY;
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        email,
        password,
        returnSecureToken: true,
      }
    );

    const uid = response.data.localId;

    const customToken = await authAdmin.createCustomToken(uid);

    res.status(200).json({ customToken });
  } catch (error) {
    console.error("Erro no login:", error.response?.data || error.message);
    let message = "Falha ao logar.";
    if (error.response?.data?.error?.message === "EMAIL_NOT_FOUND") {
      message = "Email não encontrado.";
    } else if (error.response?.data?.error?.message === "INVALID_PASSWORD") {
      message = "Senha incorreta.";
    }
    res.status(401).json({ message });
  }
});

//Salvar tarefas no Realtime DB
app.post("/api/salvarTarefa", async (req, res) => {
  try {
    const newTask = req.body;
    const equipeId = newTask.equipeId; // recebe o id/nome da equipe aqui

    if (
      !equipeId ||
      !newTask.responsavel ||
      !newTask.name ||
      !newTask.cliente ||
      !newTask.date ||
      !newTask.dataInsercao ||
      !newTask.type ||
      !newTask.description
    ) {
      return res.status(400).json({ message: "Todos os campos devem ser preenchidos." });
    }

    const tempRef = db.ref(`Tarefas/${equipeId}`).push();
    const keyBD = tempRef.key;

    const caminhoFormatado = newTask.name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const dataLimite = newTask.date;
    const caminhoFinal = `${caminhoFormatado} (${dataLimite}) ${keyBD}`;

    await db.ref(`Tarefas/${equipeId}/${caminhoFinal}`).set(newTask);

    res.status(201).json({ id: caminhoFinal, message: "Tarefa salva com sucesso." });
  } catch (error) {
    console.error("Erro ao salvar tarefa no Banco de Dados: ", error);
    res.status(500).json({ message: "Erro interno do servidor ao salvar tarefa.", error: error.message });
  }
});

// Puxar tarefas do Firebase por equipeId
app.get("/api/puxarTarefas", async (req, res) => {
  try {
    const equipeId = req.query.equipeId;

    if (!equipeId) {
      return res.status(400).json({ message: "equipeId é obrigatório." });
    }

    const tarefasRef = db.ref(`Tarefas/${equipeId}`);
    const snapshot = await tarefasRef.once("value");
    const tarefas = snapshot.val();

    const tarefasArray = [];
    if (tarefas) {
      for (const tarefaId in tarefas) {
        tarefasArray.push({ id: tarefaId, ...tarefas[tarefaId] });
      }
    }

    res.status(200).json(tarefasArray);
  } catch (error) {
    console.error("Erro ao buscar tarefas: ", error);
    res
      .status(500)
      .json({ message: "Erro ao buscar tarefas", error: error.message });
  }
});



//Deletar tarefa
app.delete("/api/deletarTarefa/:id", async (req, res) => {
  try {
    const equipeId = req.query.equipeId;
    if (!equipeId) {
      return res.status(400).json({ message: "EquipeId é obrigatório." });
    }
    await db.ref(`Tarefas/${equipeId}`).remove();

    res.status(200).json({ message: "Tarefa deletada com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar tarefa: ", error);
    res
      .status(500)
      .json({ message: "Erro ao deletar tarefa", error: error.message });
  }
});

//Atualizar tarefa
app.put("/api/editarTarefa/:id", async (req, res) => {
  try {
    const equipeId = req.query.equipeId;
    const tarefaId = req.params.id;

    if (!equipeId || !tarefaId) {
      return res.status(400).json({ message: "EquipeId e ID da tarefa são obrigatórios." });
    }

    const updatedTaskData = req.body;

    await db.ref(`Tarefas/${equipeId}/${tarefaId}`).update(updatedTaskData);
    res.status(200).json({ message: "Tarefa atualizada com sucesso." });
  } catch (error) {
    console.error("Erro ao atualizar tarefa: ", error);
    res.status(500).json({ message: "Erro ao atualizar tarefa", error: error.message });
  }
});
