export type Msg = { from: "them" | "me"; text: string };
export const SEED: Msg[] = [
  { from: "them", text: "Hey! I'm 2 minutes away with your order 🛵" },
  { from: "me", text: "Awesome, thank you! I'm in the lobby." },
  { from: "them", text: "Can't find the entrance — can you call me?" },
];
