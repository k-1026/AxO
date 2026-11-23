import "./styles.css";
import "./auth/auth.css";
import "./chat/chat.css";
import "./plan/plan.css";
import { loadAppData } from "./data/repository.js";
import { startApp, getPlanningContext, getCurrentLine } from "./app.js";
import { initAuth } from "./auth/auth.js";
import { initChat } from "./chat/chat.js";
import { initCreate } from "./plan/create.js";

initAuth();
initChat({ getContext: getPlanningContext });
initCreate({ getCurrentLine });
loadAppData().then(startApp);
