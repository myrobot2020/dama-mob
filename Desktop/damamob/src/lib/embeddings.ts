/**
 * DAMA Embedding Utility
 * Handles converting text into semantic vectors.
 * OpenAI is no longer used.
 */

export async function getEmbedding(text: string): Promise<number[]> {
  // Placeholder: main app now uses the local LangBot/Chroma stack for RAG.
  // If the frontend needs to compute embeddings, it should call the /api/embedding endpoint
  // on the backend which uses local models (e.g. all-MiniLM-L6-v2).
  console.warn("getEmbedding called on client-side. This should be handled by the backend.");

  // Return a dummy vector if called, to prevent crashes while we transition.
  return new Array(384).fill(0);
}
