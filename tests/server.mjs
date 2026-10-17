import { createServer } from 'node:http';

createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(
        '<!doctype html><html><head><title>Playwright fixture</title></head><body>Fixture</body></html>'
    );
}).listen(6128, '127.0.0.1');
