/* eslint-disable no-console */
import { WebSocket, WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3010 });

console.log('listening on 3010');

wss.on('connection', function connection(ws) {
   console.log('connected');
   ws.on('error', console.error);

   ws.on('message', (data) => {
      const str = data.toString();
      try {
         const arr = JSON.parse(str);
         if (Array.isArray(arr)) {
            const [id, parsed] = arr;
            if (typeof id !== 'number') {
               console.log('invalid message');
               console.log(JSON.stringify(arr, null, 2));
               return;
            }
            if (arr.length !== 2) {
               console.log('invalid message');
               console.log(JSON.stringify(arr, null, 2));
               sendError(ws, id, 'expected a single object payload');
               return;
            }

            if (Array.isArray(parsed)) {
               sendError(ws, id, 'expected a single object payload');
               console.log('unhandled payload');
               for (const item of parsed) console.log(`\t ${item}`);
            } else if (typeof parsed === 'object') {
               receiveMessage(id, parsed, ws);
            }
         } else {
            console.log(`string payload ${JSON.stringify(arr, null, 2)}`);
         }
      } catch (_e) {
         console.log(`non message payload ${str}`);
      }
   });
});

import * as Messages from './messages';
import { Tree, runLiveTrace, treeRoot } from './tsTrace';
import {
   setIdentifierGeneratedImportReference,
   setLocalizedDiagnosticMessages,
} from 'typescript';

export function init() {}

// let messageHandler = (message: any) => console.log(message);
// export function setMessageHandler(handler: (message: any) => void) {
//    messageHandler = handler;
// }

// export function emitMessage(message: any) {
//    globalSocket?.emit(message.message, message);
// }

/*
io.on('connection', (socket) => {
   globalSocket = socket; // dumb but good enough.  latest connection get's the vscode emits
   console.log('a user connected');
   messageHandler('init client');
   socket.on('message', (...args: any[]) => {
      receiveMessage(args, socket);
   });
   socket.on('ping', () => {
      console.log('pinged');
      socket.emit('pong');
   });
});

server.listen(3010, 'localhost', () => {
   console.log('server running at http://localhost:3010');
});
 
*/
function receiveMessage(id: number, args: unknown, ws: WebSocket) {
   const parsed = Messages.message.safeParse(args);
   if (parsed.error) {
      console.log(JSON.stringify(args, null, 2));
      return;
   }

   switch (parsed.data.message) {
      case 'traceStart':
         runLiveTrace(parsed.data.projectPath, parsed.data.traceDir);
         const response: Messages.Message = { message: 'traceStop' };
         sendResponse(ws, id, response);
         break;

      case 'filterTree': {
         const { startsWith, sourceFileName, position } = parsed.data;
      }
   }
}

export function filterTree(
   startsWith: string,
   sourceFileName: string,
   position: number | '',
   tree = treeRoot
): Tree[] {
   if (position === '') position = 0;

   if (!tree) return [];

   if (
      'name' in tree.line &&
      tree.line.name.startsWith(startsWith) &&
      (!sourceFileName ||
         (tree.line.args?.path ?? '').endsWith(sourceFileName)) &&
      (!(position > 0) || (tree.line.args?.pos ?? 0) === position)
   ) {
      return [tree];
   }

   return tree.children
      .map((child) => filterTree(startsWith, sourceFileName, position, child))
      .flat();
}

export const treeIdNodes = new Map<number, Tree>();
let showTreeInterval: undefined | ReturnType<typeof setInterval>;
export function showTree(
   startsWith: string,
   sourceFileName: string,
   position: number | '',
   updateUi = true,
   tree = treeRoot,
   ws: WebSocket
) {
   if (showTreeInterval) {
      clearInterval(showTreeInterval);
      showTreeInterval = undefined;
   }

   const nodes = filterTree(startsWith, sourceFileName, position, tree);
   const skinnyNodes = nodes.map((x) => ({ ...x, children: [], types: [] }));
   if (updateUi)
      sendMessage(ws, {
         message: 'filterTree',
         startsWith,
         sourceFileName,
         position,
      });

   sendMessage(ws, {
      message: 'showTree',
      nodes: [],
      step: 'start',
   });

   let i = 0;

   // this can be large enough to freeze the UI if sent at once
   showTreeInterval = setInterval(() => {
      if (!showTreeInterval) return;

      sendMessage(ws, {
         message: 'showTree',
         nodes: skinnyNodes.slice(i, i + 10),
         step: 'add',
      });
      i += 10;
      if (i >= skinnyNodes.length) {
         clearInterval(showTreeInterval);
         showTreeInterval = undefined;
         sendMessage(ws, {
            message: 'showTree',
            nodes: [],
            step: 'done',
         });
      }
   }, 30);

   nodes.forEach((node) => treeIdNodes.set(node.id, node));
   return nodes;
}

function sendResponse(ws: WebSocket, id: number, response: Messages.Message) {
   ws.send(JSON.stringify([id, response]));
}

function sendError(ws: WebSocket, id: number, errorMessage: string) {
   ws.send(JSON.stringify([id, 'error', errorMessage]));
}

function sendMessage(ws: WebSocket, message: Messages.Message) {
   ws.send(JSON.stringify(message));
}
