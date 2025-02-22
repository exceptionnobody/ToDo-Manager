
import dayjs from 'dayjs';
import isYesterday from 'dayjs/plugin/isYesterday';
import isTomorrow from 'dayjs/plugin/isTomorrow';
import isToday from 'dayjs/plugin/isToday';

import { Form, ListGroup, Button } from 'react-bootstrap/';
import { PersonSquare, PencilSquare, Trash } from 'react-bootstrap-icons';
import Pagination from "react-js-pagination";

dayjs.extend(isYesterday).extend(isToday).extend(isTomorrow);


const formatDeadline = (d) => {
  if (!d) return '--o--';
  else if (d.isToday()) {
    return d.format('[Today at] HH:mm');
  } else if (d.isTomorrow()) {
    return d.format('[Tomorrow at] HH:mm');
  } else if (d.isYesterday()) {
    return d.format('[Yesterday at] HH:mm');
  } else {
    return d.format('dddd DD MMMM YYYY [at] HH:mm');
  }
}

const TaskRowData = (props) => {
  const { task, onCheck, filter, assignedTaskList } = props;
  const labelClassName = `${task.important ? 'important' : ''} ${task.completed ? 'completed' : ''}`;
  var assignedUser = "";

  assignedTaskList.forEach(element => {

    if(element.status=="active"){
      if(String(element.taskId)==String(task.id)){
        assignedUser = element.userName;
      } 
    }
  });

  return (
    <>
      <div className="flex-fill m-auto">
          <Form.Group className="m-0" controlId="formBasicCheckbox">
            <Form.Check type="checkbox">
            { (filter == 'assigned')?
              <Form.Check.Input type="radio" checked={task.active?true:false} onChange={ (ev) => onCheck(ev.target.checked)} />
              : null
            }
              <Form.Check.Label className={labelClassName} >{task.description}</Form.Check.Label>
            </Form.Check>
          </Form.Group>
        </div>
      { (assignedUser != "")?
        <div className="flex-fill mx-2 m-auto">
          <span style={false ? {border: "0px solid blue"} : {border: "1px solid blue"}} >{assignedUser}</span>
        </div>
        : null
      }
      <div className="flex-fill mx-2 m-auto"><PersonSquare className={task.private ? 'invisible' : ''} /></div>
      <div className="flex-fill m-auto"><small>{formatDeadline(dayjs(task.deadline))}</small></div>
    </>
  )
}

const TaskRowControl = (props) => {
  const { task, onDelete, onEdit, onComplete, filter } = props;
  return (
    <>
      <div className="ml-10">
        { (filter == 'owned') ? 
            [
              <Button key={task.id+29} variant="link" className="shadow-none" onClick={onEdit}><PencilSquare /></Button>,
              <Button key={task.id+13}variant="link" className="shadow-none" onClick={onDelete}><Trash /></Button>
            ]
          : 
          task.completed ? 
            <Button key={task.id+37} variant="success" className="shadow-none" disabled>Completed</Button> :
            <Button key={task.id+17} variant="success" className="shadow-none" onClick={onComplete}>Complete</Button>
        }
      </div>
    </>
  )
}


const ContentList = (props) => {
  const { tasks, onDelete, onEdit, onCheck, onComplete, filter, getTasks, handler, assignedTaskList } = props;


  return (
    <>
      <ListGroup key={"ListTask"} as="ul" variant="flush">
        {
          tasks.map(t => {
            return (
              <ListGroup.Item as="li" key={t.id} className="d-flex w-100 justify-content-between">
                  <TaskRowData task={t} onCheck={ (flag) => onCheck(t, flag)} filter={filter}  handler={handler} assignedTaskList={assignedTaskList} />
                  <TaskRowControl task={t} onDelete={() => onDelete(t)} onEdit={() => onEdit(t)} onComplete ={() => onComplete(t)} filter={filter}/>
              </ListGroup.Item>
            );
          })
        }
      </ListGroup>
      <Pagination 
          key={"Pagination"}
          itemClass="page-item" // add it for bootstrap 4
          linkClass="page-link" // add it for bootstrap 4
          activePage={parseInt(localStorage.getItem("currentPage"))}
          itemsCountPerPage={parseInt(localStorage.getItem("totalItems"))/parseInt(localStorage.getItem("totalPages"))}
          totalItemsCount={parseInt(localStorage.getItem("totalItems"))}
          pageRangeDisplayed={10}
          onChange={getTasks}
          pageSize ={parseInt(localStorage.getItem("totalPages"))}
      />
    </>
  )
}

export default ContentList;