FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 4176
CMD ["node", "-e", "const s=require('http'),f=require('fs'),p=require('path');const m={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.wasm':'application/wasm','.ico':'image/x-icon','.json':'application/json'};s.createServer((q,r)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';let fp=p.join('/app/dist',u);if(!fp.startsWith('/app/dist')){r.writeHead(403);r.end();return}f.readFile(fp,(e,d)=>{if(e){f.readFile('/app/dist/index.html',(e2,d2)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(d2)})}else{r.writeHead(200,{'Content-Type':m[p.extname(fp)]||'application/octet-stream'});r.end(d)}})}).listen(4176,'0.0.0.0')"]
