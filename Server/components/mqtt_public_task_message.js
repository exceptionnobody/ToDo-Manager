class MQTTPublicTaskMessage {    
    constructor(status, id, task) {

        this.status = status;
        this.id = id;
        if(task) this.task = task;
    }
}

module.exports = MQTTPublicTaskMessage;