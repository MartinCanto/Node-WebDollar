/* Added by Silviu Bogdan Stroe - https://www.silviu-s.com */
/* Edited by Cosmin-Dumitru Oprea */

import consts from 'consts/const_global'

const atob = require('atob');
import MainBlockchain from 'main-blockchain/Blockchain';
import StatusEvents from "common/events/Status-Events";
import Utils from "common/utils/helpers/Utils";
let pounchdb = (process.env.BROWSER) ? (require('pouchdb').default) : (require('pouchdb-node'));

class InterfaceSatoshminDB {

    constructor(databaseName = consts.DATABASE_NAMES.DEFAULT_DATABASE) {

        this._dbName = databaseName;
        this._beingRestarted = false;

        this._start();
    }

    _start(){

        try {
            this.db = new pounchdb(this._dbName, {revs_limit: 1});
        } catch (exception){
            console.error("InterfaceSatoshminDB exception", pounchdb);
        }

    }

    async restart(){

        if ( this._beingRestarted )
            return await Utils.sleep ( 1500);

        this._beingRestarted = true;

        this.close();
        await Utils.sleep(1500);
        this._start();

        this._beingRestarted = false;

    }

    async _createDocument(key, value) {

        await this._deleteDocumentAttachmentIfExist(key);

        try {
            let response = await this.db.put({_id: key, value: value});

            return true;
        } catch (err) {
            if (err.status === 409)
                return this._updateDocument(key, value);
            else {
                console.error("_createDocument raised exception", key, err);
                throw err;
            }
        }

    }

    async _updateDocument(key, value) {

        try {
            let doc = await this.db.get(key);

            let response = await this.db.put({
                _id: doc._id,
                _rev: doc._rev,
                value: value
            });

            return true;
        } catch (exception) {
            console.error("_updateDocument error" + key, exception);
            throw exception;
        }

    }

    async _getDocument(key) {

        try {
            let response = await this.db.get(key, {attachments: true});

            if ( !response._attachments )
                return response.value;
            else //get attachment
                return new Buffer(atob(response._attachments.key.data).toString('hex'), 'hex');

        } catch (Exception) {

            if (Exception.status === 404) //NOT FOUND
                return null;
            else {
                console.error("error _getDocument ", Exception);
                throw Exception;
            }
        }

    }

    async _deleteDocument(key) {

        try {
            let doc = await this.db.get(key, {attachments: true});

            let response = await this.db.remove(doc._id, doc._rev);

            return true;

        } catch (err) {
            if (err.status === 404) //NOT FOUND
                return null;
            else {
                console.error("_deleteDocument raised an error ", key);
                return err;
            }
        }

    }

    async _saveDocumentAttachment(key, value) {

        let attachment = value;
        // we need blob in browser
        if (process.env.BROWSER && Buffer.isBuffer(value)){
            attachment = new Blob([value.toString('hex')]);
        } else { //we are in node
            attachment = new Buffer(value.toString('hex'));
        }

        try {

            await this._createDocument(key, null);

            let result = await this.db.put({
                _id: key,
                _attachments: {
                    key: {
                        content_type: 'application/octet-binary',
                        data: attachment
                    }
                }
            });

            return true;

        } catch (err) {


            if (err.status === 409) {
                return await this._updateDocumentAttachment(key, attachment);
            } else {
                if (err.status === 404) {

                    //if document not exist, create it and recall attachment
                    try {

                        let response = this._createDocument(key, null);
                        return await this._saveDocumentAttachment(key, value);

                    } catch (exception) {

                        console.error('_saveDocumentAttachment raised an error for key ' + key, exception);
                    }

                } else {
                    console.error('_saveDocumentAttachment 222 raised an error for key ' + key, err);
                    throw err;
                }
            }

        }

    }

    async _updateDocumentAttachment(key, value) {

        try {
            let doc = await this.db.get(key, {attachments: true});

            try {
                let reuslt = await this.db.put({
                    _id: doc._id,
                    _attachments: {
                        key: {
                            content_type: 'application/octet-binary',
                            data: value
                        }
                    },
                    _rev: doc._rev
                });
                return true;
            } catch (err) {
                console.error("error _updateDocumentAttachment1 " + key, err);
                throw err;
            }


        } catch (err) {
            console.error("error _updateDocumentAttachment2  " + key, err);
            throw err;
        }
    }

    async _deleteDocumentAttachment(key) {
        try {
            let doc = await this.db.get(key);

            let result = await this.db.removeAttachment(doc._id, this._dbName, doc._rev);

            return true;

        } catch (exception) {
            return false;
            throw exception;
        }
    }

    async _deleteDocumentAttachmentIfExist(key) {

        try {
            return this._deleteDocumentAttachment(key);
        } catch (err) {
            console.error("_deleteDocumentAttachmentIfExist raised an error", err);
            return false;
        }
    }


    //main methods
    _save(key, value) {

        return new Promise(async (resolve)=>{

            try {
                if (Buffer.isBuffer(value))
                    resolve(await this._saveDocumentAttachment(key, value));
                else
                    resolve(await this._createDocument(key, value));

            } catch (exception) {
                console.error("db.save error " + key, exception);

                if (Math.random() < 0.1) console.error(key, value);

                if (exception.status === 500)
                    StatusEvents.emit("blockchain/logs", {message: "IndexedDB Error", reason: exception.reason.toString() });

                resolve(null);
            }

        })
    }

    async save( key, value, timeout, trials = 10){

        if (!trials) trials = 1;

        let i=0;
        while ( i < trials){

            let out = await this._save(key, value, timeout);
            if (out)
                return out;

            if (i > 0 && i % 5 === 0 )
                await this.restart();

            i++;
        }

        return null;
    }

    _get(key, timeout, freeze){

        return new Promise( resolve => {

            //timeout, max 10 seconds to load the database
            let timeoutInterval = setTimeout(()=>{

                console.error("SatoshminDB Get failed !!", key);
                if ( freeze ) return;
                resolve(null);

            }, timeout);


            this._getDocument(key).then( answer =>{

                clearTimeout(timeoutInterval);
                resolve({result: answer } );

            }).catch(exception => {

                clearTimeout(timeoutInterval);
                console.error("db.get error " + key, exception);

                StatusEvents.emit("blockchain/logs", { message: "IndexedDB Error", reason: exception.reason.toString() });

                if (freeze ) return;
                resolve(null);

            });

        })

    }

    async get(key, timeout=7000, trials = 20, freeze=false) {

        if ( !trials ) trials = 1;

        let i = 0;
        while (i < trials) {

            let out = await this._get(key, timeout, freeze);
            if (out)
                return out.result;

            if (i > 0 && i % 5 === 0 )
                await this.restart();

            i++;
        }

        return null;

    }

    async remove(key) {
        try {
            return await this._deleteDocument(key);
        } catch (exception) {

            console.error("db.remove error " + key, exception);

            if (exception.status === 500)
                StatusEvents.emit("blockchain/logs", {message: "IndexedDB Error", reason: exception.reason.toString() });

        }
        return null;
    }

    close(){

        if (this.db)
            this.db.close();

    }

}

export default InterfaceSatoshminDB;
