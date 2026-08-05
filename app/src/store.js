import { configureStore } from "@reduxjs/toolkit";
import { player } from "./player/entity/PlayerReducer.js";

const store = configureStore({ reducer: { player } });
export default store;
