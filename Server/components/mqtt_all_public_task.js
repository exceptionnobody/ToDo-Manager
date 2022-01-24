class MQTTAllPublicTaskMessage {    
    constructor(status, number, taskList) {

        this.status = status;
        this.number = number;
        this.taskList = taskList;

    }
}

module.exports = MQTTAllPublicTaskMessage;