import { Form, Button, Alert, Modal } from 'react-bootstrap';
import { useState } from 'react';

function LoginForm(props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(true);
  const [showAlert, setShowAlert] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleClose = () => setShow(false);
  


  const handleSubmit = (event) => {
    event.preventDefault();
    setErrorMessage('');
    const credentials = { email, password };

    // basic validation
    let valid = true;
    if (email === '' || password === '' || password.length < 6) {
      valid = false;
      setErrorMessage('Email cannot be empty and password must be at least six character long.');
      setShow(false);
    }

    if(valid)
    {
      props.login(credentials)
        .catch( (err) => { setErrorMessage(err); setShow(true); } )
    }


  };


  return (
    <Modal centered show={show} animation={false} onHide={handleClose}>
      <Form onSubmit={handleSubmit} >
        <Modal.Header closeButton>
          <Modal.Title>Login</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert
            dismissible
            show={showAlert}
            onClose={() => setShowAlert(false)}
            variant="danger">
            {errorMessage}
          </Alert>
          <Form.Group controlId="email">
            <Form.Label>email</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
          </Form.Group>
          <Form.Group controlId="password">
            <Form.Label>Password</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button type="submit">Login</Button>
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

function LogoutButton(props) {
  return (
      <Button variant="outline-light" onClick={props.logout}>Logout</Button>
  )
}

export { LoginForm, LogoutButton };


