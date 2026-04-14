import Koa from "koa";
import bodyParser from "koa-body";
import Router from "koa-router";
import coalesceBody from "@server/middlewares/coaleseBody";
import type { AppState, AppContext } from "@server/types";
import { verifyCSRFToken } from "@server/middlewares/csrf";

const app = new Koa<AppState, AppContext>();
const router = new Router();

app.use(bodyParser());
app.use(coalesceBody());
app.use(verifyCSRFToken());
app.use(router.routes());

export default app;
