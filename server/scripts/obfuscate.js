const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

function obfuscateFile(filePath) {
    console.log(`🔒 Obfuscating: ${filePath}`);
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        const obfuscationResult = JavaScriptObfuscator.obfuscate(
            fileContent,
            {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 1,
                numbersToExpressions: true,
                simplify: true,
                stringArrayShuffle: true,
                splitStrings: true,
                stringArrayThreshold: 1,
                target: 'node'
            }
        );
        
        fs.writeFileSync(filePath, obfuscationResult.getObfuscatedCode());
    } catch (error) {
        console.error(`❌ Failed to obfuscate ${filePath}:`, error);
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
            obfuscateFile(fullPath);
        }
    }
}

const distPath = path.join(__dirname, '../dist');

console.log("🛡️  Starting Code Protection (Obfuscation)...");
if (fs.existsSync(distPath)) {
    // 1. Obfuscate Entry Point
    const mainFile = path.join(distPath, 'main.js');
    if (fs.existsSync(mainFile)) {
        obfuscateFile(mainFile);
    }

    // 2. Obfuscate Licensing Module explicitly
    const licensingDir = path.join(distPath, 'licensing');
    processDirectory(licensingDir);
    
    console.log("✅ Obfuscation Complete.");
} else {
    console.error("❌ 'dist' directory not found. Run 'npm run build' first.");
    process.exit(1);
}
