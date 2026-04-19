/**
 * Nitro (Cloud Run): same corpus + audio routes as Vite dev — without this, `/__dama_corpus__/`
 * falls through to the SPA and returns HTML (broken sutta reader).
 */
import path from "node:path";
import { fromNodeMiddleware } from "h3";
import { corpusFsMiddleware } from "../../corpus-fs-serve";

const corpusRoot =
  process.env.CORPUS_ROOT?.trim() || path.join(process.cwd(), "corpus");
const audRoot =
  process.env.AUD_ROOT?.trim() || path.join(process.cwd(), "aud");

export default fromNodeMiddleware(corpusFsMiddleware(corpusRoot, audRoot));
