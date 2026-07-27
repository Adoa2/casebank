from pydantic import BaseModel

# POST
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class PasswordResetRequest(BaseModel):
    username: str
    email: str

class PasswordResetVerify(BaseModel):
    username: str
    code: str
    new_password: str


class MessageResponse(BaseModel):
    message: str
