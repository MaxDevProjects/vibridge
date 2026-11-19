#!/usr/bin/env bash
# Explicit, optional installation of a small open-source GGUF on the VS Code WSL host.
# Does not install or execute any binary received over the network.
set -euo pipefail

if ! command -v llama-cli >/dev/null 2>&1; then
  echo "llama-cli introuvable. Installe d'abord llama.cpp depuis son projet officiel."
  echo "https://github.com/ggml-org/llama.cpp"
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl est requis pour télécharger le modèle explicitement choisi."
  exit 1
fi
repo='https://huggingface.co/Qwen/Qwen3-0.6B-GGUF'
filename='Qwen3-0.6B-Q8_0.gguf'
target_dir="${HOME}/.local/share/vibridge/models"
file="${target_dir}/${filename}"

if [[ -f "${file}" ]]; then
  echo "Un modèle existe déjà : ${file}"
  echo "Il ne sera pas remplacé automatiquement."
  exit 0
fi

echo "Modèle : Qwen3-0.6B GGUF Q8_0, Apache 2.0, environ 639 Mo à télécharger."
echo "Source : ${repo}/tree/main"
echo "Ce modèle est chargé uniquement pendant l'interprétation demandée."
read -r -p "Télécharger maintenant ? [o/N] " answer
if [[ "${answer}" != 'o' && "${answer}" != 'O' ]]; then
  echo "Installation annulée."
  exit 0
fi
mkdir -p "${target_dir}"
chmod 700 "${target_dir}"
tmp="${file}.partial.$$"
trap 'rm -f "${tmp}"' EXIT
curl --fail --location --retry 2 --connect-timeout 20 \
  "${repo}/resolve/main/${filename}" --output "${tmp}"
size=$(wc -c < "${tmp}")
if (( size < 100000000 || size > 1500000000 )); then
  echo "Taille inattendue (${size} octets). Fichier non installé."
  exit 1
fi
chmod 600 "${tmp}"
mv "${tmp}" "${file}"
echo ""
echo "Modèle installé localement : ${file}"
echo "Dans VS Code WSL, ouvre les paramètres UTILISATEUR et renseigne :"
echo "devbridge.interpreterEnabled = true"
echo "devbridge.interpreterModelPath = ${file}"
echo "devbridge.interpreterBinary = $(command -v llama-cli)"
echo "Aucun serveur ni service permanent ne doit être lancé."
