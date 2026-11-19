import "./styles.css";
import "./auth/auth.css";
import "./chat/chat.css";
import { loadAppData } from "./data/repository.js";
import { startApp, getPlanningContext } from "./app.js";
import { initAuth } from "./auth/auth.js";
import { initChat } from "./chat/chat.js";

initAuth();
initChat({ getContext: getPlanningContext });
loadAppData().then(startApp);
