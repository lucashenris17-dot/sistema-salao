import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Função para uso em componentes cliente (mantida para compatibilidade)
export function getSupabase() {
  return supabase;
}

// Tipo Procedimento (mantido para compatibilidade)
export interface Procedimento {
  id: string;
  nome: string;
  duracao_estimada_min: number;
  ativo: boolean;
  criado_em?: string;
}