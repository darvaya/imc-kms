import { createBrowserHistory } from "history";
import env from "~/env";

const history = createBrowserHistory({ basename: env.BASE_PATH ?? "" });

export default history;
