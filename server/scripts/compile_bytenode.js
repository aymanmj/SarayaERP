const fs = require('fs');
const path = require('path');
const bytenode = require('bytenode');

async function compileFileToBytecode(filePath) {
    if (!filePath.endsWith('.js')) return;

    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('import.meta')) {
        console.warn(`⚠️ Skipping ${filePath} (contains import.meta which breaks Bytenode)`);
        return;
    }

    console.log(`🔒 Compiling to Bytecode: ${filePath}`);
    const jscPath = filePath + 'c'; // .jsc
    const jscBasename = path.basename(jscPath);

    // Compile to .jsc
    await bytenode.compileFile({
        filename: filePath,
        output: jscPath,
        electron: false
    });

    // Write a wrapper for the original .js file to load the .jsc file,
    // carefully copying properties to preserve CommonJS circular dependency references.
    const wrapperContent = `"use strict";
require('bytenode');
const _ext = require('./${jscBasename}');
const keys = Object.getOwnPropertyNames(_ext);
for (let i = 0; i < keys.length; i++) {
    Object.defineProperty(module.exports, keys[i], Object.getOwnPropertyDescriptor(_ext, keys[i]));
}
const syms = Object.getOwnPropertySymbols(_ext);
for (let i = 0; i < syms.length; i++) {
    Object.defineProperty(module.exports, syms[i], Object.getOwnPropertyDescriptor(_ext, syms[i]));
}
`;
    fs.writeFileSync(filePath, wrapperContent);

}

async function processDirectory(directory) {
    if (!fs.existsSync(directory)) return;

    const files = fs.readdirSync(directory);

    for (const file of files) {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            await processDirectory(fullPath);
        } else if (file.endsWith('.js')) {
            await compileFileToBytecode(fullPath);
        }
    }
}

const distPath = path.join(__dirname, '../dist/src');

async function main() {
    if (!fs.existsSync(distPath)) {
        throw new Error("Missing dist/src. Run npm run build first.");
    }
    await processDirectory(distPath);
    console.log("Bytecode compilation complete.");
}

main().catch((error) => {
    console.error("Bytecode compilation failed:", error);
    process.exitCode = 1;
});
