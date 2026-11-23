import "./privacy.css";
import { PRIVACY_META, PRIVACY_SECTIONS } from "../data/privacy.js";
import { renderPrivacy } from "./render.js";

renderPrivacy(document.getElementById("policy"), PRIVACY_META, PRIVACY_SECTIONS);
