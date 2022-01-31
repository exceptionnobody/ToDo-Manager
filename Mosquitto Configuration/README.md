MQTTForPublicChannel è usato per il canale PublicTasks


Topic: PublicChannel 
Description: it carries information about updating of the status of the tasks, in particular
             regarding the updating of a task from private to public and about the creation of
             a public task.

Client QoS when it subscribes: 1 
Server QoS when the server publishes messages: 1

Client retain: false
Server retain: false

Topic: CarryPublicIds
Description: it carries all the public ids of the tasks in the moment of the client connection. It is 
             a temporary channel to allow the client to obtain all the last ids of the public tasks.

Client QoS when it subscribes: 2
Server Qos when it subscribes: 2

retain: false