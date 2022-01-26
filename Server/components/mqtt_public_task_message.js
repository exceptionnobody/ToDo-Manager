class MQTTPublicTaskMessage {    
    constructor(status, id, task) {

        this.status = status;
        if(id) this.id = id;
        if(task) this.task = task;
    }
}
// FORMATO PER TUTTI I MESSAGGI RELATIVI AI TASK PUBBLICI
module.exports = MQTTPublicTaskMessage;