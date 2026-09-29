#!/usr/bin/env bash
# Frame 44 (ROTEIRO §0.4.6): the branch nobody mentions.
# Creates the orphan branch `projecionista` with one commit dated 2036, using
# git plumbing (the working tree and the current branch are left alone).
# It doesn't push. After it, review with `git log projecionista` and publish with:
#   git push origin projecionista
# (the repository must be public for the site's `git` card to see it).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

note=$(mktemp)
cat > "$note" <<'MD'
# PROJECIONISTA

Se você está lendo isto, alguém deixou o projetor ligado.

Fui eu. Em 2036 eu ainda estou aqui, trocando rolo, limpando a janela,
consertando o `controle.py` que alguém quebrou de novo.

Você perguntou quem liga o projetor. A resposta está na Cabine 0,
e ela só abre com os 48.

---

If you're reading this, someone left the projector running.

It was me. In 2036 I'm still here, changing reels, cleaning the gate,
fixing the `controle.py` somebody broke again.

You asked who runs the projector. The answer is in Cabin 0,
and it only opens with all 48.

— o projecionista
MD

blob=$(git hash-object -w "$note")
rm -f "$note"
tree=$(printf '100644 blob %s\tPROJECIONISTA.md\n' "$blob" | git mktree)
when='2036-09-29T23:59:00-03:00'
commit=$(GIT_AUTHOR_NAME='o projecionista' GIT_AUTHOR_EMAIL='projecionista@sessao-noturna' GIT_AUTHOR_DATE="$when" \
  GIT_COMMITTER_NAME='o projecionista' GIT_COMMITTER_EMAIL='projecionista@sessao-noturna' GIT_COMMITTER_DATE="$when" \
  git commit-tree "$tree" -m 'deixei o projetor ligado pra você')
git branch -f projecionista "$commit"
git log --format='%H%n%an <%ae>%n%ad%n%n    %s' -1 projecionista
echo
echo "Branch projecionista created locally. Publish with: git push origin projecionista"
