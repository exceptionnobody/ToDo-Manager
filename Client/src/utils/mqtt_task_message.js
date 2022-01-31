class MQTTTaskMessage {    
    constructor(status, userId, userName, task) {

        this.status = status;
        if(userId) this.userId = userId;
        if(userName) this.userName = userName;
        if(task) this.task = task;
    }
}

module.exports = MQTTTaskMessage;


