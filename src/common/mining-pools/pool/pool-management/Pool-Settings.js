import InterfaceSatoshminDB from 'common/satoshmindb/Interface-SatoshminDB';
import consts from 'consts/const_global';
import WebDollarCrypto from "../../../crypto/WebDollar-Crypto";
import ed25519 from "common/crypto/ed25519";

import Utils from "common/utils/helpers/Utils";
import PoolsUtils from "common/mining-pools/common/Pools-Utils"
import Blockchain from "main-blockchain/Blockchain";
import ed25519 from "common/crypto/ed25519";
import StatusEvents from "common/events/Status-Events";

class PoolSettings {

    constructor(wallet, poolManagement, databaseName){

        this.poolManagement = poolManagement;
        this._wallet = wallet;
        this._db = new InterfaceSatoshminDB( databaseName ? databaseName : consts.DATABASE_NAMES.POOL_DATABASE );

        this._poolFee = 0.02;
        this._poolName = '';
        this._poolWebsite = '';
        this._poolServers = [];
        this._poolPOWValidationProbability = 0.10; //from 100
        this._poolActivated = false;

        this._poolPrivateKey = WebDollarCrypto.getBufferRandomValues(64);
        this.poolPublicKey = undefined;

        this.poolURL = '';

    }

    async initializePoolSettings(poolFee){

        let result = await this._getPoolPrivateKey();

        result = result && await this._getPoolDetails();

        if (poolFee !== undefined)
            this.setPoolFee(poolFee);

        if (result)
            this.poolManagement.poolInitialized = true;

        return result;

    }

    _generatePoolURL(){

        if (this._poolName === '' || this._poolFee === 0 || this._poolServers === [] ){
            this.poolURL = '';
            return '';
        }

        let servers = this.poolServers.join(";");
        servers = servers.replace(/\//g, '$' );

        let website = this.poolWebsite.replace(/\//g, '$' );

        this.poolURL =  ( consts.DEBUG? 'http://webdollar.ddns.net:9094' : 'https://webdollar.io') +'/pool/0/'+encodeURI(this._poolName)+"/"+encodeURI(this.poolFee)+"/"+encodeURI(this.poolPublicKey.toString("hex"))+"/"+encodeURI(website)+"/"+encodeURI(servers);
        StatusEvents.emit("pools/settings", { message: "Pool Settings were saved", poolName: this._poolName, poolServer: this._poolServers, poolFee: this._poolFee, poolWebsite: this._poolServers });

        return this.poolURL;

    }


    get poolName(){

        return this._poolName;
    }

    async setPoolName(newValue, skipSaving = false){

        if (this._poolName === newValue ) return;

        PoolsUtils.validatePoolName(newValue);

        this._poolName = newValue;

        if (!skipSaving)
            if (false === await this._db.save("pool_name", this._poolName)) throw {message: "PoolName couldn't be saved"};

        this._generatePoolURL();
    }

    get poolWebsite(){
        return this._poolWebsite;
    }

    get poolFee(){
        return this._poolFee;
    }

    async setPoolFee(newValue, skipSaving = false){

        if (this._poolFee !== newValue) return;

        PoolsUtils.validatePoolFee(newValue);

        this._poolFee = newValue;

        if (!skipSaving)
            if (false === await this._db.save("pool_fee", this._poolFee)) throw {message: "PoolFee couldn't be saved"};

        this._generatePoolURL();
    }


    async setPoolWebsite(newValue, skipSaving = false){

        if (this._poolWebsite === newValue ) return;

        PoolsUtils.validatePoolWebsite(newValue);

        this._poolWebsite = newValue;

        if (!skipSaving)
            if (false === await await this._db.save("pool_website", this._poolWebsite)) throw {message: "PoolWebsite couldn't be saved"};

        this._generatePoolURL();
    }

    get poolPrivateKey(){

        return this._poolPrivateKey;
    }

    async setPoolActivated(newValue, skipSaving = false){

        PoolsUtils.validatePoolActiviated(newValue);

        this._poolActivated = newValue;

        if (!skipSaving)
            if (false === await this._db.save("pool_activated", this._poolActivated ? "true" : "false")) throw {message: "poolActivated couldn't be saved"};

        if (!newValue)
            await this.poolManagement.poolProtocol.stopPoolProtocol();
        else await this.poolManagement.poolProtocol.startPoolProtocol();

        StatusEvents.emit("pools/settings", { message: "Pool Settings were saved", poolName: this._poolName, poolServer: this._poolServers, poolFee: this._poolFee, poolWebsite: this._poolServers });
    }



    get poolActivated(){
        return this._poolActivated;
    }



    get poolPOWValidationProbability(){
        return this._poolPOWValidationProbability;
    }


    get poolServers(){
        return this._poolServers;
    }

    getPoolServersText(){
        if (typeof this._poolServers === "string" ) return this._poolServers;

        return PoolsUtils.convertServersList(this._poolServers);
    }

    async setPoolServers(newValue, skipSaving = false){

        PoolsUtils.validatePoolServers(newValue);

        if ( JSON.stringify(this._poolServers ) === JSON.stringify( newValue ) ) return;

        newValue = PoolsUtils.processServersList( newValue );
        this._poolServers = newValue;

        if (!skipSaving)
            if (false === await this._db.save("pool_servers", JSON.stringify(this._poolServers))) throw {message: "PoolServers couldn't be stored"};

        await this.poolManagement.poolProtocol.poolConnectedServersProtocol.insertServersListWaitlist( this._poolServers );
        this._generatePoolURL();

    }

    async savePoolPrivateKey(){

        let result = await this._db.save("pool_privateKey", this._poolPrivateKey);

        return result;
    }

    async _getPoolPrivateKey(){

        this._poolPrivateKey = await this._db.get("pool_privateKey", 30*1000, true);

        if (this._poolPrivateKey === null) {

            let privateKey = await Blockchain.Wallet.addresses[0].getPrivateKey();
            let finalPrivateKey = Buffer.concat( [ WebDollarCrypto.SHA256(WebDollarCrypto.MD5(privateKey)), WebDollarCrypto.SHA256( WebDollarCrypto.RIPEMD160(privateKey) )]);

            this._poolPrivateKey = ed25519.generatePrivateKey(finalPrivateKey);

        }

        if (Buffer.isBuffer(this._poolPrivateKey)){
            this.poolPublicKey = ed25519.generatePublicKey(this._poolPrivateKey);
        } else
            throw {message: "poolPrivateKey is wrong"}

        return true;
    }

    async justValidatePoolDetails(poolName, poolFee, poolWebsite, poolServers, poolActivated){

        return PoolsUtils.validatePoolsDetails(poolName, poolFee, poolWebsite, this.poolPublicKey, poolServers, poolActivated);

    }

    async _getPoolDetails(){

        let poolName = await this._db.get("pool_name", 30*1000, true);
        if (poolName === null) poolName = '';

        let poolFee;
        try {

            poolFee = await this._db.get("pool_fee", 30 * 1000, true);
            if (poolFee === null)
                poolFee = 0.02;

            poolFee = parseFloat(poolFee);
        } catch (exception){

            poolFee = 0.02;

        }

        let poolWebsite = await this._db.get("pool_website", 30*1000, true);
        if (poolWebsite === null) poolWebsite = '';

        let poolServers = JSON.parse( await this._db.get("pool_servers", 30*1000, true) );
        if (poolServers === null) poolServers = '';

        let poolActivated = await this._db.get("pool_activated", 30*1000, true);
        if (poolActivated === null) poolActivated = '';

        if (poolActivated === 'true') poolActivated = true;
        else poolActivated = false;

        if (false === await this.justValidatePoolDetails(poolName, poolFee, poolWebsite, poolServers, poolActivated))
            return false;

        await this.setPoolName( poolName , false );
        await this.setPoolFee ( poolFee , false);
        await this.setPoolWebsite ( poolWebsite , false );
        await this.setPoolServers ( poolServers , false );
        await this.setPoolActivated( poolActivated , false );

        return true;

    }

    poolDigitalSign(message){

        let signature = ed25519.sign( message, this._poolPrivateKey );
        return signature;

    }

}

export default PoolSettings;