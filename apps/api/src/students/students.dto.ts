import {
  ArrayUnique,
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateStudentDto {
  @IsString() @MinLength(3) @MaxLength(40) studentId: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MaxLength(500) description: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  courseIds?: string[];
}
