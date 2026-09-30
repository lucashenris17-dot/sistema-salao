"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function salvarSenha() {
    const { error } = await supabase.auth.updateUser({
      password: senha,
    });

    if (error) {
      setMensagem(error.message);
      return;
    }

    setMensagem("Senha alterada com sucesso!");

    setTimeout(() => {
      router.push("/login");
    }, 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="bg-white rounded-2xl shadow p-8 w-full max-w-md">

        <h1 className="text-xl font-bold mb-4 text-zinc-900">
          Nova senha
        </h1>

        <input
          type="password"
          placeholder="Digite a nova senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mb-4"
        />

        <button
          onClick={salvarSenha}
          className="w-full bg-zinc-900 text-white rounded-lg py-2"
        >
          Salvar senha
        </button>

        {mensagem && (
          <p className="mt-4 text-sm text-zinc-600">
            {mensagem}
          </p>
        )}

      </div>
    </div>
  );
}