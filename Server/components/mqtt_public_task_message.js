class MQTTForPublicChannel {    
    constructor(type, id, task) {

        this.type = type;
        if(id) this.id = id;
        if(task) this.task = task;
    }
}
// FORMATO PER TUTTI I MESSAGGI RELATIVI AI TASK PUBBLICI
module.exports = MQTTForPublicChannel;