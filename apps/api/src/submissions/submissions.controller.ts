import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { CurrentUser } from '../auth/current-user';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards';
import { JwtPrincipal, Role } from '../common/domain';
import { FeedbackDto } from './submissions.dto';
import { SubmissionsService } from './submissions.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('submissions')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubmissionsController {
  constructor(private readonly service: SubmissionsService) {}

  @Post('assignments/:id/submissions')
  @Roles(Role.STUDENT)
  @UseInterceptors(FilesInterceptor('files', 25, {
    storage: diskStorage({
      destination: process.env.LOCAL_STORAGE_ROOT ?? './uploads',
      filename: (_request, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 26_214_400, files: 25 },
  }))
  submit(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: JwtPrincipal) {
    return this.service.submit(id, files, user);
  }

  @Get('assignments/:id/my-submission')
  @Roles(Role.STUDENT)
  mine(@Param('id') id: string, @CurrentUser() user: JwtPrincipal) { return this.service.mine(id, user); }

  @Get('assignments/:id/submissions')
  @Roles(Role.ADMIN, Role.TEACHER)
  list(@Param('id') id: string, @CurrentUser() user: JwtPrincipal) { return this.service.listByAssignment(id, user); }

  @Post('submissions/:id/review')
  @Roles(Role.ADMIN, Role.TEACHER)
  review(@Param('id') id: string, @CurrentUser() user: JwtPrincipal) { return this.service.review(id, user); }

  @Put('submissions/:id/feedback')
  @Roles(Role.ADMIN, Role.TEACHER)
  feedback(@Param('id') id: string, @Body() dto: FeedbackDto, @CurrentUser() user: JwtPrincipal) {
    return this.service.feedback(id, dto.text, false, user);
  }

  @Post('submissions/:id/feedback/publish')
  @Roles(Role.ADMIN, Role.TEACHER)
  publish(@Param('id') id: string, @Body() dto: FeedbackDto, @CurrentUser() user: JwtPrincipal) {
    return this.service.feedback(id, dto.text, true, user);
  }

  @Get('files/:submissionId/:index/content')
  async content(
    @Param('submissionId') submissionId: string,
    @Param('index', ParseIntPipe) index: number,
    @CurrentUser() user: JwtPrincipal,
    @Res() response: Response,
  ) {
    const { file, opened } = await this.service.openFile(submissionId, index, user);
    response.setHeader('Content-Type', opened.mime);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    opened.stream.on('error', (error) => response.destroy(error));
    opened.stream.pipe(response);
  }

  @Get('storage/health')
  @Roles(Role.ADMIN, Role.TEACHER)
  storageHealth() { return this.service.storageHealth(); }
}
