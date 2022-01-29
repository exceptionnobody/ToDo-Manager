class MQTTAllPublicIdTasksMessage {    
    constructor(type, number, taskList) {

        this.type = type;
        this.number = number;
        this.taskList = taskList;

    }
}

module.exports = MQTTAllPublicIdTasksMessage;