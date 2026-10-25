// The in-app assistant is called Brick. Provider and model names never appear in the interface, including inside
// error text that comes back from a service.
export const AI_NAME = "Brick";
export const unbrand = (text) => String(text ?? "").replace(/\b(claude|anthropic|gemini|bitdeer|openai|gpt)\b[\w.-]*/gi, AI_NAME);
