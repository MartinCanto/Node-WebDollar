import NodesWaitlist from 'node/lists/waitlist/nodes-waitlist'
import NodeProtocol from 'common/sockets/protocol/node-protocol';
import NodesList from 'node/lists/nodes-list'
import NODES_TYPE from "../../../node/lists/types/Nodes-Type";

class NodePropagationProtocol {

    constructor(){

        this._newFullNodesWaitList = [];
        this._newLightNodesWaitList = [];

    }

    processNewFullNodeInterval(){

        if (this._newFullNodesWaitList.length > 0) {

            let waitlist = null;

            while (waitlist === null && this._newFullNodesWaitList.length > 0) {

                let index = 0;
                let newNode = this._newFullNodesWaitList[index];

                waitlist = NodesWaitlist.addNewNodeToWaitlist(newNode.address.addr, newNode.address.port, newNode.address.type, newNode.address.connected, newNode.socket.node.level + 1, newNode.socket);

                this._newFullNodesWaitList.splice(index, 1);

            }

        }

        setTimeout( this.processNewFullNodeInterval.bind(this), 300);

    }

    processNewLightNodeInterval(){

        if (this._newLightNodesWaitList.length > 0) {

            let waitlist = null;

            while (waitlist === null && this._newLightNodesWaitList.length > 0) {

                let index = 0;
                let newNode = this._newLightNodesWaitList[index];

                waitlist = NodesWaitlist.addNewNodeToWaitlist(newNode.address.addr, newNode.address.port, newNode.address.type, newNode.address.connected, newNode.socket.node.level + 1, newNode.socket);

                this._newLightNodesWaitList.splice(index, 1);

            }

        }

        setTimeout( this.processNewLightNodeInterval.bind(this), 300);

    }

    initializeSocketForPropagation(socket){

        this.initializeNodesPropagation(socket);

        setTimeout( ()=>{
            socket.node.sendRequest("propagation/request-all-wait-list-nodes");
        },  1000);

        NodesList.emitter.on("nodes-list/connected", nodeListObject => { this._newNodeConnected(socket, nodeListObject) } );
        NodesList.emitter.on("nodes-list/disconnected", nodeListObject => { this._nodeDisconnected(socket, nodeListObject) });

        NodesWaitlist.emitter.on("waitlist/new-node", nodeWaitListObject => { this._newNodeConnected(socket, nodeWaitListObject) } );
        NodesWaitlist.emitter.on("waitlist/delete-node", nodeWaitListObject => { this._nodeDisconnected(socket, nodeWaitListObject) });

    }

    initializeNodesPropagation(socket){

        socket.node.on("propagation/request-all-wait-list-full-nodes", response =>{

            try{

                let list = [];

                for (let i=0; i<NodesList.nodes.length; i++)
                    list.push(NodesList.nodes[i].toJSON());

                for (let i=0; i<NodesWaitlist.waitListFullNodes.length; i++)
                    list.push(NodesWaitlist.waitListFullNodes[i].toJSON());

                socket.node.sendRequest("propagation/nodes", {"op": "new-full-nodes", addresses: list });

            } catch(exception){

            }

        });

        socket.node.on("propagation/request-all-wait-list-light-nodes", response =>{

            try{

                let list = [];

                for (let i=0; i<NodesList.nodes.length; i++)
                    list.push(NodesList.nodes[i].toJSON());

                for (let i=0; i<NodesWaitlist.waitListFullNodes.length; i++)
                    list.push(NodesWaitlist.waitListLightNodes[i].toJSON());

                socket.node.sendRequest("propagation/nodes", {"op": "new-light-nodes", addresses: list });

            } catch(exception){

            }

        });

        socket.node.on("propagation/nodes", response => {

            try {

                let addresses = response.addresses || [];
                if (typeof addresses === "string") addresses = [addresses];

                if (!Array.isArray(addresses)) throw {message: "addresses is not an array"};

                let op = response.op || '';
                switch (op) {

                    case "new-full-nodes":

                        for (let i = 0; i < addresses.length; i++) {

                            let found = false;
                            for (let j=0;  j<this._newFullNodesWaitList.length; j++)
                                if (this._newFullNodesWaitList[j].addr === addresses[i].addr) {
                                    found = true;
                                    break;
                                }

                            if (!found)
                                this._newFullNodesWaitList.push({address: addresses[i], socket: socket});
                        }

                        break;

                    case "new-light-nodes":

                        for (let i = 0; i < addresses.length; i++) {

                            let found = false;
                            for (let j=0;  j<this._newFullNodesWaitList.length; j++)
                                if (this._newLightNodesWaitList[j].addr === addresses[i].addr) {
                                    found = true;
                                    break;
                                }

                            if (!found)
                                this._newLightNodesWaitList.push({address: addresses[i], socket: socket});
                        }

                        break;

                    case "deleted-nodes":

                        for (let i = 0; i < addresses.length; i++)
                            NodesWaitlist.removedWaitListElement( addresses[i].addr, addresses[i].port, socket );

                        break;

                    default:
                        throw {message: "Op is invalid"};

                }

            }
            catch (exception){

            }

        });
    }

    _newNodeConnected(socket, nodeWaitListObject){

        if (nodeWaitListObject.type === NODES_TYPE.NODE_TERMINAL)
            socket.node.sendRequest("propagation/nodes", {op: "new-full-nodes", addresses: [nodeWaitListObject.toJSON() ]},);
        else if(nodeWaitListObject.type === NODES_TYPE.NODE_WEB_PEER)
            socket.node.sendRequest("propagation/nodes", {op: "new-light-nodes", addresses: [nodeWaitListObject.toJSON() ]},);

    }

    _nodeDisconnected(socket, nodeWaitListObject){

        if (nodeWaitListObject.type === NODES_TYPE.NODE_TERMINAL)
            socket.node.sendRequest("propagation/nodes", {op: "deleted-full-nodes", addresses: [nodeWaitListObject.toJSON() ]},);
        else if(nodeWaitListObject.type === NODES_TYPE.NODE_WEB_PEER)
            socket.node.sendRequest("propagation/nodes", {op: "deleted-light-nodes", addresses: [nodeWaitListObject.toJSON() ]},);

    }

}

export default new NodePropagationProtocol();
