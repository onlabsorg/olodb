const olodg = require("./olodg");
const rootPath = `${__dirname}/..`;

function generate (orig, dest) {
    process.stdout.write(`docgen: Generating documentation for ${orig} ... `);
    olodg.generateDocumentation(`${rootPath}/${orig}`, `${rootPath}/${dest}`);
    process.stdout.write("[done].\n");    
}



generate("lib/OlodbServer.js", "doc/OlodbServer.md");
