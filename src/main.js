import "./styles.css";
import "./auth/auth.css";
import "./chat/chat.css";
import "./plan/plan.css";
import "./intro/yakjang.css";
import { loadAppData } from "./data/repository.js";
import { startApp, getCurrentLine } from "./app.js";
import { initAuth } from "./auth/auth.js";
import { initCreate } from "./plan/create.js";
import { initMy } from "./plan/my.js";
import { initYakjang } from "./intro/yakjang.js";

initYakjang();
initAuth();
initCreate({ getCurrentLine });
initMy();
loadAppData().then(startApp);
