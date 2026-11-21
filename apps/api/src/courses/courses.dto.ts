import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { CourseStatus } from "../common/domain";
export class CreateCourseDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  studentIds?: string[];
}
export class UpdateCourseDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsEnum(CourseStatus) status?: CourseStatus;
}
export class EnrollDto {
  @IsMongoId() studentId: string;
}
