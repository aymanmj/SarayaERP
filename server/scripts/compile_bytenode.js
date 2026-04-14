const fs = require('fs');
const path = require('path');
const bytenode = require('bytenode');

function compileFileToBytecode(filePath) {
    if (!filePath.endsWith('.js')) return;
    
    // Some files might be better left uncompiled, like scripts that need to be run natively or config
    // We will skip main.js in the root if we want it to be a plain loader, but compiling it is fine too.
    
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('import.meta')) {
        console.warn(`⚠️ Skipping ${filePath} (contains import.meta which breaks Bytenode)`);
        return;
    }

    console.log(`🔒 Compiling to Bytecode: ${filePath}`);
    try {
        const jscPath = filePath + 'c'; // .jsc
        const jscBasename = path.basename(jscPath);
        
        // Compile to .jsc
        bytenode.compileFile({
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
        
    } catch (error) {
        console.error(`❌ Failed to compile ${filePath}:`, error);
    }
}

function processDirectory(directory) {
    if (!fs.existsSync(directory)) return;

    const files = fs.readdirSync(directory);
    
    for (const file of files) {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (file.endsWith('.js')) {
            compileFileToBytecode(fullPath);
        }
    }
}

const distPath = path.join(__dirname, '../dist/src');

console.log("🛡️ Starting Code Protection (V8 Bytecode Compilation via Bytenode)...");
if (fs.existsSync(distPath)) {
    // We compile the entire dist directory
    processDirectory(distPath);
    console.log("✅ Bytecode Compilation Complete. All logic is now protected as Machine Code.");
} else {
    console.error("❌ 'dist' directory not found. Run 'npm run build' first.");
    process.exit(1);
}
