'use strict';
/**
 * build-lib.js — pecas comuns aos montadores (build.js, build-sla.js).
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

/**
 * Logo da CVC embutido em base64: o entregavel e UM arquivo, sem imagem externa.
 * O PNG e transparente (fundo branco removido) e fica em src/assets/.
 */
function logoDataUri() {
  const arq = path.join(ROOT, 'src', 'assets', 'logo-cvc.png');
  if (!fs.existsSync(arq)) {
    console.error('Falta src/assets/logo-cvc.png (logo da CVC usado no menu lateral).');
    process.exit(1);
  }
  return 'data:image/png;base64,' + fs.readFileSync(arq).toString('base64');
}

module.exports = { logoDataUri };
