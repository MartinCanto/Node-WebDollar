import PoolSettings from "./Pool-Settings";
import PoolData from 'common/mining-pools/pool/pool-management/pool-data/Pool-Data';
import consts from 'consts/const_global';
import PoolWorkManagement from "./Pool-Work-Management";
import PoolProtocol from "./protocol/Pool-Protocol"
import StatusEvents from "common/events/Status-Events";
/*
 * Miners earn shares until the pool finds a block (the end of the mining round).
 * After that each user gets reward R = B * n / N,
 * where n is amount of his own shares,
 * and N is amount of all shares in this round.
 * In other words, all shares are equal, but its cost is calculated only in the end of a round.
 */

class PoolManagement{

    constructor(blockchain, wallet, databaseName){

        this.blockchain = blockchain;

        this.poolSettings = new PoolSettings(wallet, this);
        this.poolWorkManagement = new PoolWorkManagement( this );
        this.poolProtocol = new PoolProtocol( this );

        this._poolInitialized = false;
        this._poolOpened = false;
        this._poolStarted = false;

        // this.blockchainReward = BlockchainMiningReward.getReward();
        this._baseHash = new Buffer(consts.MINING_POOL.BASE_HASH_STRING, "hex");

        this.poolData = new PoolData(this, databaseName);

        this._resetMinedBlockStatistics();

    }

    async initializePoolManagement(poolFee){

        let answer = await this.poolSettings.initializePoolSettings(poolFee);
        console.info("The url is just your domain: "+ this.poolSettings.poolURL);

        if (!answer ){
            throw {message: "Pool Couldn't be started"};
            return false;
        }

        if (this.poolSettings.poolURL !== '' && this.poolSettings.poolURL !== undefined)
            this.poolOpened = true;
        else {
            console.error("Couldn't start MinerPool");
            return false;
        }

        return answer;

    }

    async startPool(){

        if (this.poolSettings.poolURL !== '' && this.poolSettings.poolURL !== undefined)
            return this.poolProtocol.startPoolProtocol();

        return false
    }

    generatePoolWork(minerInstance){

        return this.poolWorkManagement.getWork(minerInstance);

    }

    receivePoolWork(minerInstance, work){

       return this.poolWorkManagement.processWork(minerInstance, work)
    }

    /**
     * Update rewards for all miners. This function must be called at every block reward
     * @param newReward is the total new reward of the pool
     */
    updateRewards() {
        return this.poolData.updateRewards();
    }

    /**
     * Do a transaction from reward wallet to miner's address
     */
    static sendReward(miner) {

        let minerAddress = miner.address;
        let reward = miner.reward;

        //TODO: Do the transaction

        //TODO: clear the poolTransaction

        return true;
    }

    /**
     * Send rewards for miners and reset rewards from storage
     */
    async sendRewardsToMiners() {
        for (let i = 0; i < this.poolData.miners.length; ++i)
            await this.sendReward(this.poolData.miners[i]);
    }

    _resetMinedBlockStatistics() {
        /**
         * To be able to mine a block, the pool should generate ~ numBaseHashes of difficulty baseHashDifficulty
         * In other words: The arithmetic mean of all generated hashes by pool to mine a block should be
         * equal with numBaseHashes * baseHashDifficulty
         * Each miner will receive a reward wighted on the number of baseHashDifficulty sent to pool leader.
         */
        this._currentBlockStatistics = {
            baseHashDifficulty: Buffer.from(this._baseHash),
            numBaseHashes: 0
        };
    }

    get poolOpened(){
        return this._poolOpened;
    }

    get poolInitialized(){
        return this._poolInitialized;
    }

    get poolStarted(){
        return this._poolStarted;
    }

    set poolInitialized(value){
        this._poolInitialized = value;
        StatusEvents.emit("pools/status", {result: value, message: "Pool Initialization changed" });
    }

    set poolOpened(value){
        this._poolOpened = value;
        StatusEvents.emit("pools/status", {result: value, message: "Pool Opened changed" });
    }

    set poolStarted(value){
        this._poolStarted = value;
        StatusEvents.emit("pools/status", {result: value, message: "Pool Started changed" });
    }

}

export default PoolManagement;