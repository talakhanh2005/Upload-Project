import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateTeacherDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @MinLength(8) @MaxLength(128) temporaryPassword: string;
}

export class UpdateTeacherDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
}

export class ResetTeacherPasswordDto {
  @IsString() @MinLength(8) @MaxLength(128) temporaryPassword: string;
}
