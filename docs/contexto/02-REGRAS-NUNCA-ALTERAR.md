# Regras importantes do projeto

Antes de qualquer alteração:

Sempre preservar funcionalidades existentes.

Nunca alterar sem autorização:

- migrations já aplicadas;
- estrutura do banco;
- políticas RLS;
- fluxo de aprovação;
- tokens de acompanhamento;
- fila atual de atendimento;
- páginas funcionando.


Sempre executar após alterações:

npx tsc --noEmit

npm run build


Prioridade:

1. Não quebrar o sistema existente.
2. Fazer mudanças pequenas.
3. Testar antes de continuar.