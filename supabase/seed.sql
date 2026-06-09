-- Seed data. First create these users in Supabase Auth, then replace UUIDs below with their Auth user IDs.
-- admin@example.com / teacher@example.com / student1@example.com etc.

-- Optional: after registering in the app, update roles like this:
-- update profiles set role='main_admin' where email='admin@example.com';
-- update profiles set role='teacher', can_manage_questions=true, can_view_reports=true where email='teacher@example.com';

insert into chapters (chapter_name, subject) values
('Computer Fundamentals','Computer Science'),
('Operating Systems','Computer Science'),
('Database Management','Computer Science'),
('Computer Networks','Computer Science'),
('Cybersecurity Basics','Computer Science')
on conflict do nothing;

with ch as (select id, chapter_name from chapters)
insert into questions (chapter_id, question_text, option_a, option_b, option_c, option_d, correct_option, difficulty, marks)
select ch.id, q.question_text, q.a, q.b, q.c, q.d, q.correct, q.diff, 1
from ch join (values
('Computer Fundamentals','What does CPU stand for?','Central Processing Unit','Central Program Utility','Computer Personal Unit','Control Processing User','A','easy'),
('Computer Fundamentals','Which memory is volatile?','ROM','RAM','Hard Disk','SSD','B','easy'),
('Computer Fundamentals','Binary number system uses how many digits?','2','8','10','16','A','easy'),
('Computer Fundamentals','Which is an input device?','Monitor','Printer','Keyboard','Speaker','C','easy'),
('Computer Fundamentals','ALU performs which operation?','Arithmetic and logic','Storage','Networking','Printing','A','medium'),
('Computer Fundamentals','Which software manages hardware resources?','Compiler','Operating System','Browser','Editor','B','easy'),
('Computer Fundamentals','1 byte equals how many bits?','4','8','16','32','B','easy'),
('Computer Fundamentals','Which is system software?','MS Word','Linux','Chrome','Photoshop','B','medium'),
('Computer Fundamentals','Cache memory is usually placed between CPU and?','RAM','Printer','Monitor','Keyboard','A','medium'),
('Computer Fundamentals','Which generation used microprocessors?','First','Second','Third','Fourth','D','medium'),
('Operating Systems','Which scheduling algorithm is non-preemptive by default?','FCFS','Round Robin','SRTF','Priority preemptive','A','easy'),
('Operating Systems','Semaphore is used for?','Synchronization','Compilation','Routing','Formatting','A','medium'),
('Operating Systems','Deadlock requires how many necessary conditions?','2','3','4','5','C','medium'),
('Operating Systems','Which technique divides memory into fixed-size pages?','Paging','Segmentation','Thrashing','Spooling','A','easy'),
('Operating Systems','LRU stands for?','Least Recently Used','Last Random Unit','Low Resource Usage','Least Run Utility','A','easy'),
('Operating Systems','Which state means process is waiting for CPU?','Running','Ready','Blocked','Terminated','B','easy'),
('Operating Systems','Thrashing is related to?','Excessive paging','CPU overheating','Disk formatting','File naming','A','medium'),
('Operating Systems','Banker algorithm is used for?','Deadlock avoidance','File compression','CPU design','Encryption','A','medium'),
('Operating Systems','Context switching occurs between?','Processes','Files','Folders','Printers','A','easy'),
('Operating Systems','A critical section is code accessing?','Shared resource','Private variable only','Compiler','BIOS','A','medium'),
('Database Management','SQL stands for?','Structured Query Language','System Query Logic','Sequential Query Language','Simple Query Link','A','easy'),
('Database Management','Primary key must be?','Unique and not null','Always text','Duplicated','Foreign only','A','easy'),
('Database Management','Which command removes rows from table?','DELETE','SELECT','SHOW','DESCRIBE','A','easy'),
('Database Management','3NF removes?','Transitive dependency','All tables','Primary keys','SQL queries','A','medium'),
('Database Management','Foreign key references?','Another table key','Image file','Index only','View only','A','easy'),
('Database Management','Which join returns matching rows only?','INNER JOIN','LEFT JOIN','RIGHT JOIN','FULL JOIN','A','easy'),
('Database Management','ACID I stands for?','Isolation','Index','Input','Integrity','A','medium'),
('Database Management','A view is a?','Virtual table','Physical disk','Trigger','Constraint','A','medium'),
('Database Management','Which SQL clause filters groups?','HAVING','WHERE','ORDER BY','LIMIT','A','medium'),
('Database Management','Trigger executes?','Automatically on event','Only manually','Before login only','In browser','A','medium'),
('Computer Networks','IP stands for?','Internet Protocol','Internal Program','Input Port','Internet Process','A','easy'),
('Computer Networks','HTTP default port is?','80','22','25','53','A','easy'),
('Computer Networks','HTTPS uses encryption through?','TLS/SSL','FTP','SMTP','ARP','A','medium'),
('Computer Networks','DNS converts domain names to?','IP addresses','MAC only','Passwords','Ports','A','easy'),
('Computer Networks','TCP is?','Connection-oriented','Connectionless','No transport','Only physical','A','medium'),
('Computer Networks','UDP is commonly used for?','Streaming/gaming','Bank transactions only','File permissions','BIOS boot','A','medium'),
('Computer Networks','Router works mainly at which layer?','Network','Application','Session','Physical only','A','medium'),
('Computer Networks','MAC address belongs to?','Network interface','Browser','Operating system license','RAM','A','easy'),
('Computer Networks','Ping uses which protocol?','ICMP','HTTP','FTP','SMTP','A','medium'),
('Computer Networks','LAN means?','Local Area Network','Large Access Node','Logical Array Network','Link Admin Net','A','easy'),
('Cybersecurity Basics','Phishing is mainly?','Fake attempt to steal data','Disk cleanup','Valid login','Database backup','A','easy'),
('Cybersecurity Basics','Strong password should include?','Mixed characters','Only name','Only birthdate','Only 12345','A','easy'),
('Cybersecurity Basics','Firewall is used to?','Filter network traffic','Edit images','Compile code','Format text','A','easy'),
('Cybersecurity Basics','Malware means?','Malicious software','Safe update','Hardware cable','Cloud storage','A','easy'),
('Cybersecurity Basics','2FA improves?','Authentication security','Monitor brightness','CPU speed','Keyboard layout','A','medium'),
('Cybersecurity Basics','Encryption converts plain text into?','Cipher text','Image','Table','Audio','A','medium'),
('Cybersecurity Basics','CIA triad includes confidentiality, integrity and?','Availability','Authentication','Algorithm','Analysis','A','medium'),
('Cybersecurity Basics','SQL injection targets?','Database queries','Monitor cable','CPU fan','Printer queue','A','medium'),
('Cybersecurity Basics','Antivirus detects?','Malicious files','Only PDFs','Only images','Only keyboards','A','easy'),
('Cybersecurity Basics','Least privilege means giving?','Minimum required access','Admin access to all','No password','Public access','A','medium')
) as q(chapter_name, question_text, a,b,c,d,correct,diff) on q.chapter_name=ch.chapter_name
on conflict do nothing;

insert into exams (title,total_questions,min_chapters,duration_minutes,marks_per_question,difficulty,result_visible,analysis_visible)
values ('Sample Computer Science Exam',20,5,30,1,'mixed',true,true)
on conflict do nothing;

insert into exam_chapters (exam_id, chapter_id)
select e.id, c.id from exams e cross join chapters c where e.title='Sample Computer Science Exam'
on conflict do nothing;
