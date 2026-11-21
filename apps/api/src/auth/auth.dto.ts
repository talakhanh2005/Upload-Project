import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

export class StudentAccessDto {
  @IsString() @MinLength(3) @MaxLength(40) studentCode: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(8) @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}
