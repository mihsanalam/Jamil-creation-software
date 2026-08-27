import { handlers } from "@/auth";

// NextAuth handles all /api/auth/* routes: sign-in POST, session GET, etc.
export const { GET, POST } = handlers;

