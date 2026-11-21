import { IsString, MaxLength } from 'class-validator'; export class FeedbackDto { @IsString() @MaxLength(10000) text: string; }
